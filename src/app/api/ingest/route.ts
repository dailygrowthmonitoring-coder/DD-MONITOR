import { gunzipSync } from 'zlib';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createServiceRoleClient } from '@/lib/db/client';
import type { Inserts, Tables } from '@/lib/db/types';
import { parseReport } from '@/lib/parser';
import type { ParsedReport } from '@/lib/parser/types';
import { evaluateAlertRules } from '@/lib/ingest/alertEval';
import { logger } from '@/lib/logger';

// ─── Rate limiting ────────────────────────────────────────────────────────────
// Simple in-memory guard — resets per-process. Sufficient for the ingest
// volume (one email per device per day). Replace with Redis if needed.

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_MAX = 30;
const RATE_WINDOW_MS = 60_000;

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now >= entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }
  entry.count++;
  return entry.count <= RATE_MAX;
}

// ─── Response helpers ─────────────────────────────────────────────────────────

function ok<T>(data: T, status = 200) {
  return NextResponse.json({ ok: true, data }, { status });
}

function err(code: string, message: string, status: number) {
  return NextResponse.json({ ok: false, error: { code, message } }, { status });
}

// ─── Zod schema ───────────────────────────────────────────────────────────────

const IngestBodySchema = z.object({
  storagePath:    z.string().min(1),
  emailMessageId: z.string().min(1),
  subjectHint:    z.enum(['BAG', 'OFFSET', 'AVAMAR']).optional(),
});

// ─── Payload builder ──────────────────────────────────────────────────────────

function buildIngestPayload(
  report: ParsedReport,
  emailMessageId: string,
  storagePath: string,
  fileSizeBytes: number,
) {
  return {
    hostname: report.hostname,
    displayName: report.displayName,
    modelNo: report.modelNo,
    serialNo: report.serialNo,
    chassisSerial: report.chassisSerial,
    osVersion: report.osVersion,
    timeZone: report.timeZone,
    adminEmail: report.adminEmail,
    location: report.location,
    reportDate: report.reportDate,
    generatedAt: report.generatedAt.toISOString(),
    emailMessageId,
    storagePath,
    fileSizeBytes,
    parseWarnings: report.warnings,
    uptimeDays: report.uptimeDays,
    loadAvg1m: report.loadAvg1m,
    loadAvg5m: report.loadAvg5m,
    loadAvg15m: report.loadAvg15m,
    memTotalMib: report.memTotalMib,
    memFreeMib: report.memFreeMib,
    swapTotalMib: report.swapTotalMib,
    swapFreeMib: report.swapFreeMib,
    systemAvailabilityPct: report.systemAvailabilityPct,
    fsAvailabilityPct: report.fsAvailabilityPct,
    lastCleaningAt: report.lastCleaningAt?.toISOString() ?? null,
    capacitySnapshots: report.capacitySnapshots.map(s => ({
      tier: s.tier,
      resource: s.resource,
      sizeGib: s.sizeGib,
      usedGib: s.usedGib,
      availGib: s.availGib,
      usePct: s.usePct,
      cleanableGib: s.cleanableGib,
    })),
    compressionStats: report.compressionStats.map(s => ({
      period: s.period,
      precompGib: s.precompGib,
      postcompGib: s.postcompGib,
      globalCompFactor: s.globalCompFactor,
      localCompFactor: s.localCompFactor,
      totalCompFactor: s.totalCompFactor,
      reductionPct: s.reductionPct,
    })),
    deviceAlerts: report.deviceAlerts.map(a => ({
      alertId: a.alertId,
      severity: a.severity,
      class: a.class,
      object: a.object,
      message: a.message,
      postedAt: a.postedAt.toISOString(),
      isActive: a.isActive,
    })),
    networkInterfaces: report.networkInterfaces.map(i => ({
      port: i.port,
      state: i.state,
      linkUp: i.linkUp,
      speed: i.speed,
      duplex: i.duplex,
      hardwareAddress: i.hardwareAddress,
    })),
    disks: report.disks
      ? {
          disksInUse: report.disks.disksInUse,
          disksSpare: report.disks.disksSpare,
          disksFailed: report.disks.disksFailed,
          disksAbsent: report.disks.disksAbsent,
          reliabilityNotes: report.disks.reliabilityNotes,
        }
      : null,
    mtrees: report.mtrees.map(m => ({
      mtreePath: m.mtreePath,
      precompGib: m.precompGib,
      status: m.status,
    })),
  };
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(request: Request): Promise<NextResponse> {
  const startMs = Date.now();
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';

  // Rate limit
  if (!checkRateLimit(ip)) {
    return err('RATE_LIMITED', 'Too many requests', 429);
  }

  // Auth
  const providedKey = request.headers.get('x-ingest-key');
  const expectedKey = process.env.INGEST_SECRET;
  if (!providedKey || !expectedKey || providedKey !== expectedKey) {
    const supabase = createServiceRoleClient();
    await supabase.from('ingest_log').insert({
      outcome: 'auth_failed',
      detail: { ip },
      duration_ms: Date.now() - startMs,
    });
    logger.warn('ingest', 'auth_failed', { ip });
    return err('UNAUTHORIZED', 'Invalid or missing x-ingest-key', 401);
  }

  // Parse body
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return err('INVALID_BODY', 'Request body must be JSON', 400);
  }

  const parsed = IngestBodySchema.safeParse(body);
  if (!parsed.success) {
    return err('INVALID_BODY', parsed.error.message, 400);
  }

  const { storagePath, emailMessageId, subjectHint } = parsed.data;
  const traceId = emailMessageId;

  logger.info('ingest', 'ingest_start', { storagePath, emailMessageId }, traceId);

  const supabase = createServiceRoleClient();

  // Download from Storage
  let rawBytes: Buffer;
  try {
    const { data: blob, error: dlErr } = await supabase.storage
      .from('raw-reports')
      .download(storagePath);
    if (dlErr || !blob) {
      throw dlErr ?? new Error('Empty download result');
    }
    const arrayBuf = await blob.arrayBuffer();
    rawBytes = Buffer.from(arrayBuf);
  } catch (e) {
    logger.error('ingest', 'storage_read_failed', { storagePath, err: String(e) }, traceId);
    await supabase.from('ingest_log').insert({
      email_message_id: emailMessageId,
      outcome: 'parse_failed',
      detail: { code: 'STORAGE_READ_FAILED', storagePath },
      duration_ms: Date.now() - startMs,
    });
    return err('STORAGE_READ_FAILED', 'Failed to download report from storage', 502);
  }

  // Decompress if gzipped
  let rawText: string;
  try {
    rawText = storagePath.endsWith('.gz')
      ? gunzipSync(rawBytes).toString('utf-8')
      : rawBytes.toString('utf-8');
  } catch (e) {
    logger.error('ingest', 'gunzip_failed', { storagePath, err: String(e) }, traceId);
    await supabase.from('ingest_log').insert({
      email_message_id: emailMessageId,
      outcome: 'parse_failed',
      detail: { code: 'GUNZIP_FAILED', storagePath },
      duration_ms: Date.now() - startMs,
    });
    return err('STORAGE_READ_FAILED', 'Failed to decompress report', 502);
  }

  // Parse
  const parseResult = parseReport(rawText);

  if (!parseResult.ok) {
    logger.warn('ingest', 'parse_failed', { storagePath, error: parseResult.error }, traceId);
    await supabase.from('ingest_log').insert({
      email_message_id: emailMessageId,
      outcome: 'parse_failed',
      detail: { parseError: parseResult.error, warnings: parseResult.warnings },
      duration_ms: Date.now() - startMs,
    });
    return err('PARSE_FAILED', parseResult.error, 422);
  }

  // Part B — link to existing Part A report and return
  if (parseResult.type === 'part_b') {
    const partB = parseResult.data;
    logger.info('ingest', 'part_b_received', { hostname: partB.hostname }, traceId);

    // Look up device by hostname, then find the matching Part A report
    const { data: device } = await supabase
      .from('devices')
      .select('id')
      .eq('hostname', partB.hostname)
      .maybeSingle();

    if (!device) {
      logger.info('ingest', 'part_b_deferred', { hostname: partB.hostname }, traceId);
      return ok({ deferred: 'partB has no matching report yet' });
    }

    const { data: report } = await supabase
      .from('reports')
      .select('id')
      .eq('device_id', device.id)
      .eq('generated_at', partB.generatedAt.toISOString())
      .maybeSingle();

    if (!report) {
      logger.info('ingest', 'part_b_deferred', { hostname: partB.hostname }, traceId);
      return ok({ deferred: 'partB has no matching report yet' });
    }

    const { error: updateErr } = await supabase
      .from('reports')
      .update({ partb_storage_path: storagePath })
      .eq('id', report.id);

    if (updateErr) {
      logger.error('ingest', 'part_b_update_failed', { err: String(updateErr) }, traceId);
    }

    logger.info('ingest', 'part_b_linked', { reportId: report.id }, traceId);
    return ok({ linked: true, reportId: report.id });
  }

  // Part A — build payload and call ingest_report RPC
  const report = parseResult.data;
  const payload = buildIngestPayload(report, emailMessageId, storagePath, rawBytes.length);

  const { data: rpcData, error: rpcErr } = await supabase.rpc('ingest_report', { payload });

  if (rpcErr) {
    if (rpcErr.message === 'DUPLICATE_REPORT' || rpcErr.code === 'P0001') {
      logger.info('ingest', 'skipped_duplicate', { emailMessageId }, traceId);
      await supabase.from('ingest_log').insert({
        email_message_id: emailMessageId,
        device_hostname: report.hostname,
        outcome: 'skipped_duplicate',
        detail: { storagePath },
        duration_ms: Date.now() - startMs,
      });
      return err('DUPLICATE', 'Report already ingested', 409);
    }

    logger.error('ingest', 'db_tx_failed', { err: String(rpcErr), code: rpcErr.code }, traceId);
    await supabase.from('ingest_log').insert({
      email_message_id: emailMessageId,
      device_hostname: report.hostname,
      outcome: 'parse_failed',
      detail: { code: 'DB_TX_FAILED', dbError: rpcErr.message },
      duration_ms: Date.now() - startMs,
    });
    return err('DB_TX_FAILED', 'Database transaction failed', 500);
  }

  const result = rpcData as {
    report_id: string;
    device_id: string;
    device_was_new: boolean;
    status: string;
  };

  logger.info(
    'ingest',
    'ingested',
    { reportId: result.report_id, deviceId: result.device_id, deviceWasNew: result.device_was_new },
    traceId,
  );

  // Subject-hint vs resolved device-group mismatch check (optional defense-in-depth)
  let groupMismatch = false;
  let resolvedGroup: string | null = null;
  if (subjectHint) {
    const { data: deviceRow } = await supabase
      .from('devices')
      .select('device_group')
      .eq('id', result.device_id)
      .maybeSingle();
    resolvedGroup = deviceRow?.device_group ?? null;
    if (resolvedGroup && resolvedGroup !== subjectHint) {
      groupMismatch = true;
      logger.warn(
        'ingest',
        'subject_group_mismatch',
        { subjectHint, resolvedGroup, hostname: report.hostname },
        traceId,
      );
    }
  }

  // Alert rule evaluation and notifications
  let alertRules: Tables<'alert_rules'>[] = [];
  try {
    const { data: rules, error: rulesErr } = await supabase
      .from('alert_rules')
      .select('*')
      .eq('enabled', true);
    if (rulesErr) throw rulesErr;
    alertRules = rules ?? [];
  } catch (e) {
    logger.error('ingest', 'rule_eval_failed', { err: String(e) }, traceId);
  }

  const reportDate = new Date(report.reportDate + 'T12:00:00Z');
  const evalResult = evaluateAlertRules(report, alertRules, reportDate);

  const notifications: Inserts<'system_notifications'>[] = [];

  // report_received: always
  notifications.push({
    device_id: result.device_id,
    report_id: result.report_id,
    type:      'report_received',
    severity:  groupMismatch ? 'warning' : 'info',
    title:     `Report received: ${report.hostname}`,
    body:      groupMismatch
      ? `Parsed report for ${report.hostname} dated ${report.reportDate}. WARNING: email subject hinted group=${subjectHint} but hostname resolved to group=${resolvedGroup}.`
      : `Parsed report for ${report.hostname} dated ${report.reportDate}.`,
  });

  // new_device: first time this hostname was seen
  if (result.device_was_new) {
    notifications.push({
      device_id: result.device_id,
      report_id: result.report_id,
      type: 'new_device',
      severity: 'info',
      title: `New device: ${report.hostname}`,
      body: `Device ${report.hostname} was registered automatically on first report receipt.`,
    });
  }

  // critical_finding: one notification per fired rule
  for (const { rule, metricValue } of evalResult.firedRules) {
    notifications.push({
      device_id: result.device_id,
      report_id: result.report_id,
      type: 'critical_finding',
      severity: rule.severity,
      title: rule.name,
      body: `${rule.metric} ${rule.operator} ${rule.threshold} (current: ${metricValue.toFixed(1)}) on ${report.hostname}.`,
    });
  }

  try {
    const { error: notifErr } = await supabase.from('system_notifications').insert(notifications);
    if (notifErr) throw notifErr;
  } catch (e) {
    // Non-fatal: report is already stored; log and continue
    logger.error('ingest', 'notification_insert_failed', { err: String(e) }, traceId);
  }

  // Ingest log (always written, email_sent_at left null — Phase 6)
  await supabase.from('ingest_log').insert({
    email_message_id: emailMessageId,
    device_hostname: report.hostname,
    outcome: 'ingested',
    detail: {
      reportId: result.report_id,
      deviceWasNew: result.device_was_new,
      status: evalResult.status.status,
      firedRules: evalResult.firedRules.map(f => f.rule.name),
    },
    duration_ms: Date.now() - startMs,
  });

  return ok({
    reportId: result.report_id,
    deviceId: result.device_id,
    hostname: report.hostname,
    reportDate: report.reportDate,
    deviceWasNew: result.device_was_new,
    status: evalResult.status,
  });
}
