import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/db/client';
import type { Inserts } from '@/lib/db/types';
import { logger } from '@/lib/logger';
import { todayBaghdad, baghdadMidnightUtc } from '@/lib/watchdog/helpers';

export async function GET(request: Request): Promise<NextResponse> {
  // Auth — Vercel sends Authorization: Bearer <CRON_SECRET>
  const auth = request.headers.get('authorization');
  if (!auth || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    logger.warn('watchdog', 'auth_failed');
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const today = todayBaghdad();
  const windowStart = baghdadMidnightUtc(today);

  logger.info('watchdog', 'run_start', { today, windowStart });

  const supabase = createServiceRoleClient();

  // All active devices
  const { data: devices, error: devErr } = await supabase
    .from('devices')
    .select('id, hostname, device_group')
    .eq('is_active', true);

  if (devErr) {
    logger.error('watchdog', 'devices_query_failed', { err: String(devErr) });
    return NextResponse.json({ ok: false, error: 'devices_query_failed' }, { status: 500 });
  }

  if (!devices || devices.length === 0) {
    logger.info('watchdog', 'no_active_devices');
    return NextResponse.json({ ok: true, checked: 0, new: 0 });
  }

  // Device IDs that already have a report for today (Baghdad date)
  const { data: reports, error: repErr } = await supabase
    .from('reports')
    .select('device_id')
    .eq('report_date', today);

  if (repErr) {
    logger.error('watchdog', 'reports_query_failed', { err: String(repErr) });
    return NextResponse.json({ ok: false, error: 'reports_query_failed' }, { status: 500 });
  }

  const reportedIds = new Set((reports ?? []).map(r => r.device_id));
  const missing = devices.filter(d => !reportedIds.has(d.id));

  if (missing.length === 0) {
    logger.info('watchdog', 'all_reports_received', { count: devices.length });
    return NextResponse.json({ ok: true, checked: devices.length, new: 0 });
  }

  // Dedup: skip devices already notified today (Baghdad midnight → now)
  const { data: existing, error: notifErr } = await supabase
    .from('system_notifications')
    .select('device_id')
    .eq('type', 'report_missing')
    .gte('created_at', windowStart);

  if (notifErr) {
    logger.error('watchdog', 'notifications_query_failed', { err: String(notifErr) });
    return NextResponse.json({ ok: false, error: 'notifications_query_failed' }, { status: 500 });
  }

  const alreadyNotified = new Set((existing ?? []).map(n => n.device_id));
  const toNotify = missing.filter(d => !alreadyNotified.has(d.id));

  if (toNotify.length === 0) {
    logger.info('watchdog', 'all_missing_already_notified', { missing: missing.length });
    return NextResponse.json({ ok: true, checked: devices.length, new: 0 });
  }

  const rows: Inserts<'system_notifications'>[] = toNotify.map(d => ({
    device_id: d.id,
    type:      'report_missing',
    severity:  'warning',
    title:     `Missing report: ${d.hostname}`,
    body:      `No report received for ${d.hostname} (group: ${d.device_group ?? 'unknown'}) for ${today} (Asia/Baghdad).`,
  }));

  const { error: insertErr } = await supabase.from('system_notifications').insert(rows);
  if (insertErr) {
    logger.error('watchdog', 'notification_insert_failed', { err: String(insertErr) });
    return NextResponse.json({ ok: false, error: 'notification_insert_failed' }, { status: 500 });
  }

  logger.info('watchdog', 'notifications_created', {
    today,
    checked: devices.length,
    missing: missing.length,
    new:     toNotify.length,
  });

  return NextResponse.json({ ok: true, checked: devices.length, missing: missing.length, new: toNotify.length });
}
