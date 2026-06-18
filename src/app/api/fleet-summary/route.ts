import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/db/client';
import { computeStatus, DEFAULT_THRESHOLDS, type DeviceMetrics } from '@/lib/status';
import { todayBaghdad } from '@/lib/watchdog/helpers';
import { thresholdsFromRules } from '@/lib/db/queries';
import {
  buildStatusReason,
  computeGroupSummaries,
  computeCounts,
  ORDERED_GROUPS,
  type FleetSummaryData,
  type DeviceSummary,
  type IssueSummary,
} from '@/lib/fleet-summary/helpers';
import type { Tables } from '@/lib/db/types';
import { logger } from '@/lib/logger';

// ─── Auth + response helpers ──────────────────────────────────────────────────

function ok<T>(data: T) {
  return NextResponse.json({ ok: true, data }, { status: 200 });
}

function err(code: string, message: string, status: number) {
  return NextResponse.json({ ok: false, error: { code, message } }, { status });
}

// ─── Route handler (READ-ONLY — no writes to any table) ──────────────────────

export async function GET(request: Request): Promise<NextResponse> {
  // Auth: same header/secret as /api/ingest (Apps Script already has INGEST_SECRET)
  const key = request.headers.get('x-ingest-key');
  if (!key || key !== process.env.INGEST_SECRET) {
    return err('UNAUTHORIZED', 'Invalid or missing x-ingest-key', 401);
  }

  const today = todayBaghdad();
  const supabase = createServiceRoleClient();

  // ── Step 1: load rules + devices + today's reports in parallel (all SELECT) ──

  const [rulesRes, devicesRes, reportsRes] = await Promise.all([
    supabase.from('alert_rules').select('*').eq('enabled', true),
    supabase.from('devices')
      .select('id, hostname, display_name, device_group')
      .eq('is_active', true),
    supabase.from('reports')
      .select('id, device_id, report_date, generated_at')
      .eq('report_date', today)
      .eq('status', 'parsed'),
  ]);

  if (rulesRes.error || devicesRes.error || reportsRes.error) {
    logger.error('fleet-summary', 'base_query_failed', {
      rulesErr:   String(rulesRes.error),
      devicesErr: String(devicesRes.error),
      reportsErr: String(reportsRes.error),
    });
    return err('DB_READ_FAILED', 'Failed to query fleet data', 500);
  }

  const rules        = rulesRes.data   ?? [];
  const devices      = devicesRes.data ?? [];
  const todayReports = reportsRes.data ?? [];

  // ── Step 2: thresholds from alert_rules (same logic as dashboard) ─────────

  const thresholds         = thresholdsFromRules(rules);
  const resolvedThresholds = { ...DEFAULT_THRESHOLDS, ...thresholds };

  // ── Step 3: load child data for today's reports (all SELECT) ─────────────

  const reportIds = todayReports.map(r => r.id);

  let capsData:   Tables<'capacity_snapshots'>[]  = [];
  let compsData:  Tables<'compression_stats'>[]   = [];
  let alertsData: Tables<'device_alerts'>[]       = [];
  let netsData:   Tables<'network_interfaces'>[]  = [];
  let healthData: Tables<'system_health'>[]       = [];

  if (reportIds.length > 0) {
    const [c, cs, a, n, h] = await Promise.all([
      supabase.from('capacity_snapshots').select('*')
        .in('report_id', reportIds)
        .eq('tier', 'active')
        .ilike('resource', '%post-comp%'),
      supabase.from('compression_stats').select('*')
        .in('report_id', reportIds)
        .eq('period', 'last_7_days'),
      supabase.from('device_alerts').select('*')
        .in('report_id', reportIds)
        .eq('is_active', true),
      supabase.from('network_interfaces').select('*')
        .in('report_id', reportIds),
      supabase.from('system_health').select('*')
        .in('report_id', reportIds),
    ]);
    capsData   = c.data  ?? [];
    compsData  = cs.data ?? [];
    alertsData = a.data  ?? [];
    netsData   = n.data  ?? [];
    healthData = h.data  ?? [];
  }

  // ── Step 4: index by report_id for O(1) lookup ───────────────────────────

  const capMap    = new Map(capsData.map(r   => [r.report_id, r]));
  const compMap   = new Map(compsData.map(r  => [r.report_id, r]));
  const healthMap = new Map(healthData.map(r => [r.report_id, r]));

  const alertsByReport = new Map<string, Tables<'device_alerts'>[]>();
  for (const a of alertsData) {
    const list = alertsByReport.get(a.report_id) ?? [];
    list.push(a);
    alertsByReport.set(a.report_id, list);
  }

  const netsByReport = new Map<string, Tables<'network_interfaces'>[]>();
  for (const n of netsData) {
    const list = netsByReport.get(n.report_id) ?? [];
    list.push(n);
    netsByReport.set(n.report_id, list);
  }

  const reportByDevice = new Map(todayReports.map(r => [r.device_id, r]));

  // ── Step 5: compute per-device summary using the same status logic ────────

  const deviceSummaries: DeviceSummary[] = devices.map(device => {
    const report    = reportByDevice.get(device.id) ?? null;
    const rid       = report?.id ?? null;
    const postComp  = rid ? capMap.get(rid)    ?? null : null;
    const last7     = rid ? compMap.get(rid)   ?? null : null;
    const health    = rid ? healthMap.get(rid) ?? null : null;
    const devAlerts = rid ? (alertsByReport.get(rid) ?? []) : [];
    const nets      = rid ? (netsByReport.get(rid)   ?? []) : [];

    const runway: number | undefined =
      postComp?.avail_gib && last7?.postcomp_gib && Number(last7.postcomp_gib) > 0
        ? Number(postComp.avail_gib) / (Number(last7.postcomp_gib) / 7)
        : undefined;

    const swapUsedPct: number | undefined =
      health?.swap_total_mib
        ? ((health.swap_total_mib - (health.swap_free_mib ?? 0)) / health.swap_total_mib) * 100
        : undefined;

    const daysSinceCleaning: number | undefined =
      health?.last_cleaning_at
        ? Math.floor(
            (new Date(today + 'T12:00:00Z').getTime() - new Date(health.last_cleaning_at).getTime())
            / 86_400_000,
          )
        : undefined;

    const metrics: DeviceMetrics = {
      hasReportToday:    !!report,
      usePct:            postComp?.use_pct !== undefined ? Number(postComp.use_pct) : undefined,
      hasCriticalAlert:  devAlerts.some(a => a.severity === 'CRITICAL'),
      hasWarningAlert:   devAlerts.some(a => a.severity === 'WARNING'),
      hasInterfaceFault: nets.some(n => n.state === 'fault'),
      runwayDays:        runway,
      swapUsedPct,
      daysSinceCleaning,
    };

    const { label } = computeStatus(metrics, thresholds);
    const status =
      label === 'NO REPORT' ? 'NO REPORT' as const
      : label === 'CRITICAL' ? 'CRITICAL'  as const
      : label === 'WARNING'  ? 'WARNING'   as const
      : 'HEALTHY' as const;

    return {
      id:             device.id,
      hostname:       device.hostname,
      displayName:    device.display_name,
      group:          device.device_group,
      status,
      statusReason:   buildStatusReason(metrics, resolvedThresholds, devAlerts),
      usePct:         postComp?.use_pct !== undefined ? Number(postComp.use_pct) : null,
      lastReportDate: report?.report_date   ?? null,
      reportTime:     report?.generated_at  ?? null,
    };
  });

  // ── Step 6: group summaries + totals ──────────────────────────────────────

  const reportByDeviceForGroups = new Map(
    todayReports.map(r => [r.device_id, { generated_at: r.generated_at }]),
  );
  const groups = computeGroupSummaries(devices, reportByDeviceForGroups);

  const reportsExpected = ORDERED_GROUPS.filter(g =>
    devices.some(d => d.device_group === g),
  ).length;
  const reportsReceived = groups.filter(g => g.reportReceived).length;
  const counts          = computeCounts(deviceSummaries.map(d => d.status));

  // ── Step 7: issues — active device alerts (CRITICAL + WARNING) ───────────

  const reportToDeviceId = new Map(todayReports.map(r => [r.id, r.device_id]));
  const deviceMap        = new Map(devices.map(d => [d.id, d]));

  const issues: IssueSummary[] = alertsData
    .filter(a => a.severity === 'CRITICAL' || a.severity === 'WARNING')
    .map(a => {
      const deviceId = reportToDeviceId.get(a.report_id) ?? '';
      const dev      = deviceMap.get(deviceId);
      return {
        deviceId,
        hostname:    dev?.hostname      ?? '',
        displayName: dev?.display_name  ?? null,
        group:       dev?.device_group  ?? null,
        severity:    a.severity as 'CRITICAL' | 'WARNING',
        alertClass:  a['class'],
        alertObject: a.object,
        message:     a.message,
      };
    });

  // ── Assemble + return ─────────────────────────────────────────────────────

  const summary: FleetSummaryData = {
    date: today,
    groups,
    reportsReceived,
    reportsExpected,
    counts,
    devices: deviceSummaries,
    issues,
  };

  logger.info('fleet-summary', 'summary_built', {
    today,
    activeDevices:    deviceSummaries.length,
    reportsReceived,
    reportsExpected,
    critical:         counts.critical,
    warning:          counts.warning,
    healthy:          counts.healthy,
    missing:          counts.missing,
    issues:           issues.length,
  });

  return ok(summary);
}
