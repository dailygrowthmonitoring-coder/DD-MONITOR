/**
 * Typed DB query helpers for RSC reads. All use the SSR anon client (RLS on).
 * Functions return plain objects — no Supabase types leak past this module.
 */
import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Tables, Views, DeviceGroup, IngestOutcome } from './types';
import {
  computeStatus,
  type DeviceMetrics,
  type StatusResult,
  type AlertThresholds,
} from '@/lib/status';

// ─── Types returned by this module ────────────────────────────────────────────

export type DeviceRow   = Tables<'devices'>;
export type ReportRow   = Tables<'reports'>;
export type CapRow      = Tables<'capacity_snapshots'>;
export type CompRow     = Tables<'compression_stats'>;
export type AlertRow    = Tables<'device_alerts'>;
export type NetRow      = Tables<'network_interfaces'>;
export type HealthRow   = Tables<'system_health'>;
export type DiskRow     = Tables<'disk_summary'>;
export type MtreeRow    = Tables<'mtrees'>;
export type NotifRow    = Tables<'system_notifications'>;
export type LatestRow   = Views<'v_device_latest'>;

export interface FleetDevice {
  device:       LatestRow;
  postComp:     CapRow | null;
  last7Comp:    CompRow | null;
  health:       HealthRow | null;
  hasCritical:  boolean;
  hasWarning:   boolean;
  hasFault:     boolean;
  sparkline:    { date: string; usedGib: number }[];
  status:       StatusResult;
  metrics:      DeviceMetrics;
}

export interface DeviceDetail {
  device:       DeviceRow;
  report:       ReportRow | null;
  capacity:     CapRow[];
  compression:  CompRow[];
  alerts:       AlertRow[];
  network:      NetRow[];
  health:       HealthRow | null;
  disk:         DiskRow | null;
  mtrees:       MtreeRow[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Returns YYYY-MM-DD in Asia/Baghdad. */
export function todayBaghdad(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Baghdad' }).format(new Date());
}

/** Maps enabled alert_rules rows to threshold overrides for computeStatus(). */
export function thresholdsFromRules(rules: Tables<'alert_rules'>[]): Partial<AlertThresholds> {
  const t: Partial<AlertThresholds> = {};
  for (const r of rules) {
    if (!r.enabled || r.threshold === null) continue;
    if (r.metric === 'use_pct' && r.severity === 'warning'  && r.operator === '>=') t.usePctWarning   = Number(r.threshold);
    if (r.metric === 'use_pct' && r.severity === 'critical' && r.operator === '>=') t.usePctCritical  = Number(r.threshold);
    if (r.metric === 'swap_used_pct'       && r.operator === '>=') t.swapUsedPctWarning  = Number(r.threshold);
    if (r.metric === 'runway_days'         && r.operator === '<' ) t.runwayDaysWarning   = Number(r.threshold);
    if (r.metric === 'days_since_cleaning' && r.operator === '>' ) t.cleaningOverdueDays = Number(r.threshold);
  }
  return t;
}

function runwayDays(postComp: CapRow | null, last7: CompRow | null): number | undefined {
  if (!postComp?.avail_gib || !last7?.postcomp_gib || Number(last7.postcomp_gib) === 0) return undefined;
  return Number(postComp.avail_gib) / (Number(last7.postcomp_gib) / 7);
}

function swapPct(h: HealthRow | null): number | undefined {
  if (!h?.swap_total_mib || h.swap_total_mib === 0) return undefined;
  const used = (h.swap_total_mib - (h.swap_free_mib ?? 0));
  return (used / h.swap_total_mib) * 100;
}

function daysSinceCleaning(h: HealthRow | null, today: string): number | undefined {
  if (!h?.last_cleaning_at) return undefined;
  const ms = new Date(today).getTime() - new Date(h.last_cleaning_at).getTime();
  return Math.floor(ms / 86_400_000);
}

// ─── Fleet overview query ─────────────────────────────────────────────────────

export async function fetchFleet(
  supabase: SupabaseClient<Database>,
  group?: DeviceGroup,
): Promise<{ devices: FleetDevice[]; alertRules: Tables<'alert_rules'>[] }> {
  const today = todayBaghdad();
  const sevenAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  // When group-filtered, get device IDs first so we can scope recentReports
  let groupDeviceIds: string[] | null = null;
  if (group) {
    const { data: gd } = await supabase
      .from('devices')
      .select('id')
      .eq('device_group', group)
      .eq('is_active', true);
    groupDeviceIds = (gd ?? []).map(d => d.id);
  }

  const latestQuery = group
    ? supabase.from('v_device_latest').select('*').eq('device_group', group)
    : supabase.from('v_device_latest').select('*');

  const recentQuery = groupDeviceIds !== null
    ? supabase.from('reports')
        .select('id, device_id, report_date')
        .gte('report_date', sevenAgo)
        .eq('status', 'parsed')
        .in('device_id', groupDeviceIds.length > 0 ? groupDeviceIds : [''])
        .order('report_date', { ascending: true })
    : supabase.from('reports')
        .select('id, device_id, report_date')
        .gte('report_date', sevenAgo)
        .eq('status', 'parsed')
        .order('report_date', { ascending: true });

  const [
    { data: latest },
    { data: rules },
    { data: recentReports },
  ] = await Promise.all([
    latestQuery,
    supabase.from('alert_rules').select('*').eq('enabled', true),
    recentQuery,
  ]);

  const devRows   = latest ?? [];
  const ruleRows  = rules  ?? [];
  const thresholds = thresholdsFromRules(ruleRows);

  // All unique report IDs for latest + recent
  const latestIds  = devRows.filter(d => d.latest_report_id).map(d => d.latest_report_id!);
  const recentIds  = (recentReports ?? []).map(r => r.id);
  const allIds     = [...new Set([...latestIds, ...recentIds])];

  if (allIds.length === 0) {
    return {
      devices: devRows.map(device => ({
        device, postComp: null, last7Comp: null, health: null,
        hasCritical: false, hasWarning: false, hasFault: false,
        sparkline: [], metrics: { hasReportToday: false },
        status: computeStatus({ hasReportToday: false }, thresholds),
      })),
      alertRules: ruleRows,
    };
  }

  // Parallel child queries
  const [
    { data: caps },
    { data: comps },
    { data: alerts },
    { data: nets },
    { data: healths },
    { data: sparkCaps },
  ] = await Promise.all([
    supabase.from('capacity_snapshots').select('*').in('report_id', latestIds)
      .eq('tier', 'active').ilike('resource', '%post-comp%'),
    supabase.from('compression_stats').select('*').in('report_id', latestIds)
      .eq('period', 'last_7_days'),
    supabase.from('device_alerts').select('*').in('report_id', latestIds)
      .eq('is_active', true),
    supabase.from('network_interfaces').select('*').in('report_id', latestIds),
    supabase.from('system_health').select('*').in('report_id', latestIds),
    supabase.from('capacity_snapshots')
      .select('report_id, used_gib')
      .in('report_id', recentIds)
      .eq('tier', 'active')
      .ilike('resource', '%post-comp%'),
  ]);

  // Index by report_id for O(1) lookup
  const capMap    = new Map((caps   ?? []).map(r => [r.report_id, r]));
  const compMap   = new Map((comps  ?? []).map(r => [r.report_id, r]));
  const healthMap = new Map((healths ?? []).map(r => [r.report_id, r]));
  const sparkCapMap = new Map((sparkCaps ?? []).map(r => [r.report_id, r]));

  // Group recent reports by device for sparklines
  const recentByDevice = new Map<string, { date: string; reportId: string }[]>();
  for (const r of (recentReports ?? [])) {
    const arr = recentByDevice.get(r.device_id) ?? [];
    arr.push({ date: r.report_date, reportId: r.id });
    recentByDevice.set(r.device_id, arr);
  }

  const devices: FleetDevice[] = devRows.map(device => {
    const rid        = device.latest_report_id;
    const postComp   = rid ? capMap.get(rid)    ?? null : null;
    const last7Comp  = rid ? compMap.get(rid)   ?? null : null;
    const health     = rid ? healthMap.get(rid) ?? null : null;

    const isToday    = device.latest_report_date === today;
    const hasCritical = (alerts ?? []).some(a => a.report_id === rid && a.severity === 'CRITICAL');
    const hasWarning  = (alerts ?? []).some(a => a.report_id === rid && a.severity === 'WARNING');
    const hasFault    = (nets   ?? []).some(n => n.report_id === rid && n.state === 'fault');

    const metrics: DeviceMetrics = {
      hasReportToday:    isToday,
      usePct:            postComp?.use_pct     ?? undefined,
      hasCriticalAlert:  hasCritical,
      hasWarningAlert:   hasWarning,
      hasInterfaceFault: hasFault,
      runwayDays:        runwayDays(postComp, last7Comp),
      swapUsedPct:       swapPct(health),
      daysSinceCleaning: daysSinceCleaning(health, today),
    };

    const sparkline = (recentByDevice.get(device.id) ?? []).map(({ date, reportId }) => ({
      date,
      usedGib: Number(sparkCapMap.get(reportId)?.used_gib ?? 0),
    }));

    return {
      device, postComp, last7Comp, health,
      hasCritical, hasWarning, hasFault,
      sparkline, metrics,
      status: computeStatus(metrics, thresholds),
    };
  });

  return { devices, alertRules: ruleRows };
}

// ─── KPI queries ──────────────────────────────────────────────────────────────

export async function fetchKpis(supabase: SupabaseClient<Database>) {
  const today = todayBaghdad();

  const [
    { count: totalActive },
    { count: newToday },
    { count: reportsToday },
    { count: activeDevices },
    { data: notifications },
    { data: fleetCap },
  ] = await Promise.all([
    supabase.from('devices').select('*', { count: 'exact', head: true }).eq('is_active', true),
    supabase.from('devices').select('*', { count: 'exact', head: true })
      .gte('first_seen_at', today + 'T00:00:00+03:00'),
    supabase.from('reports').select('*', { count: 'exact', head: true })
      .eq('report_date', today).eq('status', 'parsed'),
    supabase.from('devices').select('*', { count: 'exact', head: true }).eq('is_active', true),
    supabase.from('system_notifications').select('type, severity, created_at')
      .gte('created_at', today + 'T00:00:00Z')
      .order('created_at', { ascending: false })
      .limit(50),
    supabase.from('capacity_snapshots').select('use_pct, reports!inner(report_date, status)')
      .eq('tier', 'active')
      .ilike('resource', '%post-comp%')
      .eq('reports.report_date', today)
      .eq('reports.status', 'parsed'),
  ]);

  const avgUsePct = fleetCap && fleetCap.length > 0
    ? fleetCap.reduce((s, r) => s + Number(r.use_pct ?? 0), 0) / fleetCap.length
    : null;

  return {
    totalActive:   totalActive ?? 0,
    newToday:      newToday    ?? 0,
    reportsToday:  reportsToday ?? 0,
    activeDevices: activeDevices ?? 0,
    avgUsePct,
    notifications: notifications ?? [],
  };
}

// ─── Active device alerts (fleet overview panel) ──────────────────────────────

export async function fetchActiveAlerts(
  supabase: SupabaseClient<Database>,
  group?: DeviceGroup,
) {
  const today = todayBaghdad();
  const { data } = await supabase
    .from('device_alerts')
    .select('*, reports!inner(device_id, report_date, devices(id, display_name, hostname, device_group))')
    .eq('is_active', true)
    .eq('reports.report_date', today)
    .order('severity', { ascending: true })
    .limit(50);

  if (!data) return [];
  if (!group) return data;

  // Filter to the requested group in JS (avoids complex nested PostgREST filters)
  return data.filter(a => {
    const dev = (a as unknown as { reports: { devices: { device_group: string } | null } | null })
      ?.reports?.devices;
    return dev?.device_group === group;
  });
}

// ─── Fleet sparkline (post-comp used TiB last 7 days) ─────────────────────────

export async function fetchFleetTrend(
  supabase: SupabaseClient<Database>,
  group?: DeviceGroup,
) {
  const sevenAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  // For group-scoped trend, resolve report IDs via device membership
  let reportIdFilter: string[] | null = null;
  if (group) {
    const { data: gd } = await supabase
      .from('devices')
      .select('id')
      .eq('device_group', group);
    const dIds = (gd ?? []).map(d => d.id);
    if (dIds.length === 0) return [];
    const { data: reps } = await supabase
      .from('reports')
      .select('id')
      .in('device_id', dIds)
      .gte('report_date', sevenAgo)
      .eq('status', 'parsed');
    reportIdFilter = (reps ?? []).map(r => r.id);
    if (reportIdFilter.length === 0) return [];
  }

  let q = supabase
    .from('capacity_snapshots')
    .select('used_gib, reports!inner(report_date, status)')
    .eq('tier', 'active')
    .ilike('resource', '%post-comp%')
    .eq('reports.status', 'parsed')
    .gte('reports.report_date', sevenAgo);

  if (reportIdFilter !== null) {
    q = q.in('report_id', reportIdFilter);
  }

  const { data } = await q;
  if (!data) return [];

  const byDate = new Map<string, number>();
  for (const row of data) {
    const rd = (row as unknown as { reports: { report_date: string } }).reports?.report_date;
    if (!rd) continue;
    byDate.set(rd, (byDate.get(rd) ?? 0) + Number(row.used_gib ?? 0));
  }
  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, usedGib]) => ({ date, tib: usedGib / 1024 }));
}

// ─── Device detail query ───────────────────────────────────────────────────────

export async function fetchDeviceDetail(
  supabase: SupabaseClient<Database>,
  deviceId: string,
): Promise<DeviceDetail | null> {
  const { data: device } = await supabase
    .from('devices').select('*').eq('id', deviceId).single();
  if (!device) return null;

  const { data: report } = await supabase
    .from('reports').select('*')
    .eq('device_id', deviceId).eq('status', 'parsed')
    .order('report_date', { ascending: false }).limit(1).single();

  if (!report) {
    return { device, report: null, capacity: [], compression: [], alerts: [], network: [], health: null, disk: null, mtrees: [] };
  }

  const [
    { data: capacity },
    { data: compression },
    { data: alerts },
    { data: network },
    { data: health },
    { data: disk },
    { data: mtrees },
  ] = await Promise.all([
    supabase.from('capacity_snapshots').select('*').eq('report_id', report.id),
    supabase.from('compression_stats').select('*').eq('report_id', report.id),
    supabase.from('device_alerts').select('*').eq('report_id', report.id).order('is_active', { ascending: false }),
    supabase.from('network_interfaces').select('*').eq('report_id', report.id),
    supabase.from('system_health').select('*').eq('report_id', report.id).single(),
    supabase.from('disk_summary').select('*').eq('report_id', report.id).single(),
    supabase.from('mtrees').select('*').eq('report_id', report.id),
  ]);

  return {
    device,
    report,
    capacity: capacity ?? [],
    compression: compression ?? [],
    alerts: alerts ?? [],
    network: network ?? [],
    health: health ?? null,
    disk: disk ?? null,
    mtrees: mtrees ?? [],
  };
}

// ─── Per-device 7-day capacity history (for device detail sparkline) ───────────

export async function fetchDeviceCapHistory(
  supabase: SupabaseClient<Database>,
  deviceId: string,
) {
  const sevenAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const { data } = await supabase
    .from('capacity_snapshots')
    .select('used_gib, reports!inner(report_date, device_id, status)')
    .eq('tier', 'active')
    .ilike('resource', '%post-comp%')
    .eq('reports.device_id', deviceId)
    .eq('reports.status', 'parsed')
    .gte('reports.report_date', sevenAgo);

  if (!data) return [];
  return (data as unknown as { used_gib: number; reports: { report_date: string } }[])
    .map(r => ({ date: r.reports.report_date, usedGib: Number(r.used_gib) }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

// ─── Notifications (fleet-wide, used by FleetOverview strip) ──────────────────

export async function fetchNotifications(supabase: SupabaseClient<Database>) {
  const today = todayBaghdad();
  const { data } = await supabase
    .from('system_notifications')
    .select('type, severity, created_at')
    .gte('created_at', today + 'T00:00:00Z')
    .order('created_at', { ascending: false })
    .limit(50);
  return (data ?? []) as Pick<Tables<'system_notifications'>, 'type' | 'severity'>[];
}

// ─── Alerts Center (/alerts page) ─────────────────────────────────────────────

export type AlertCenterAlert = {
  id: string;
  report_id: string;
  alert_id: string;
  severity: string;
  class: string;
  object: string;
  message: string;
  posted_at: string;
  is_active: boolean;
  device_id: string;
  device_hostname: string;
  device_display_name: string | null;
  device_group: string | null;
  report_date: string;
};

export type AlertCenterNotif = {
  id: string;
  type: string;
  severity: string;
  title: string;
  body: string;
  created_at: string;
  device_id: string | null;
  device_hostname: string | null;
  device_display_name: string | null;
  device_group: string | null;
};

export async function fetchAlertsCenter(supabase: SupabaseClient<Database>) {
  // Get latest report IDs for all active devices
  const { data: latestDevs } = await supabase
    .from('v_device_latest')
    .select('latest_report_id, id')
    .not('latest_report_id', 'is', null);

  const latestReportIds = (latestDevs ?? [])
    .map(d => d.latest_report_id!)
    .filter(Boolean);

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const [alertsRes, notifsRes] = await Promise.all([
    latestReportIds.length > 0
      ? supabase
          .from('device_alerts')
          .select('*, reports!inner(device_id, report_date, devices!inner(id, display_name, hostname, device_group))')
          .eq('is_active', true)
          .in('report_id', latestReportIds)
          .order('severity', { ascending: true })
          .order('posted_at', { ascending: false })
          .limit(500)
      : Promise.resolve({ data: [] as unknown[] }),

    supabase
      .from('system_notifications')
      .select('*, devices(id, display_name, hostname, device_group)')
      .in('type', ['report_missing', 'new_device'])
      .gte('created_at', sevenDaysAgo)
      .order('created_at', { ascending: false })
      .limit(100),
  ]);

  type RawAlert = {
    id: string; report_id: string; alert_id: string;
    severity: string; class: string; object: string;
    message: string; posted_at: string; is_active: boolean;
    reports: {
      device_id: string; report_date: string;
      devices: { id: string; display_name: string | null; hostname: string; device_group: string | null } | null;
    } | null;
  };
  type RawNotif = {
    id: string; type: string; severity: string; title: string; body: string;
    created_at: string; device_id: string | null;
    devices: { id: string; display_name: string | null; hostname: string; device_group: string | null } | null;
  };

  const deviceAlerts: AlertCenterAlert[] = ((alertsRes.data ?? []) as unknown as RawAlert[])
    .map(a => ({
      id: a.id, report_id: a.report_id, alert_id: a.alert_id,
      severity: a.severity, class: a.class, object: a.object,
      message: a.message, posted_at: a.posted_at, is_active: a.is_active,
      device_id: a.reports?.devices?.id ?? '',
      device_hostname: a.reports?.devices?.hostname ?? '',
      device_display_name: a.reports?.devices?.display_name ?? null,
      device_group: a.reports?.devices?.device_group ?? null,
      report_date: a.reports?.report_date ?? '',
    }));

  const notifications: AlertCenterNotif[] = ((notifsRes.data ?? []) as unknown as RawNotif[])
    .map(n => ({
      id: n.id, type: n.type, severity: n.severity,
      title: n.title, body: n.body, created_at: n.created_at,
      device_id: n.device_id,
      device_hostname: n.devices?.hostname ?? null,
      device_display_name: n.devices?.display_name ?? null,
      device_group: n.devices?.device_group ?? null,
    }));

  return { deviceAlerts, notifications };
}

// ─── Reports / ingest log (/reports page) ─────────────────────────────────────

export type IngestLogEntry = Tables<'ingest_log'> & {
  device: { id: string; display_name: string | null } | null;
};

export async function fetchIngestLog(supabase: SupabaseClient<Database>) {
  const today = todayBaghdad();

  const [logsRes, todayRes] = await Promise.all([
    supabase
      .from('ingest_log')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100),
    supabase
      .from('ingest_log')
      .select('outcome')
      .gte('created_at', today + 'T00:00:00Z'),
  ]);

  const logs = logsRes.data ?? [];
  const todayRows = todayRes.data ?? [];

  // Resolve device IDs from hostnames
  const hostnames = [...new Set(
    logs.filter(l => l.device_hostname).map(l => l.device_hostname!)
  )];
  const deviceMap = new Map<string, { id: string; display_name: string | null }>();

  if (hostnames.length > 0) {
    const { data: devs } = await supabase
      .from('devices')
      .select('id, hostname, display_name')
      .in('hostname', hostnames);
    for (const d of (devs ?? [])) {
      deviceMap.set(d.hostname, { id: d.id, display_name: d.display_name });
    }
  }

  const todayCounts: Record<IngestOutcome, number> = {
    ingested: 0, skipped_duplicate: 0, parse_failed: 0, auth_failed: 0,
  };
  for (const r of todayRows) {
    todayCounts[r.outcome as IngestOutcome] = (todayCounts[r.outcome as IngestOutcome] ?? 0) + 1;
  }

  return {
    logs: logs.map(l => ({
      ...l,
      device: l.device_hostname ? (deviceMap.get(l.device_hostname) ?? null) : null,
    })) as IngestLogEntry[],
    todayCounts,
  };
}

// ─── Settings data fetchers ────────────────────────────────────────────────────

export async function fetchAlertRulesAll(supabase: SupabaseClient<Database>) {
  const { data } = await supabase
    .from('alert_rules')
    .select('*')
    .order('name', { ascending: true });
  return data ?? [];
}

export async function fetchAllDevices(supabase: SupabaseClient<Database>) {
  const { data } = await supabase
    .from('devices')
    .select('*')
    .order('hostname', { ascending: true });
  return data ?? [];
}

export async function fetchAppSettings(supabase: SupabaseClient<Database>) {
  const { data } = await supabase.from('app_settings').select('*');
  const map: Record<string, unknown> = {};
  for (const row of (data ?? [])) map[row.key] = row.value;
  return map;
}
