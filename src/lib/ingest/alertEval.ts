/**
 * Pure alert-rule evaluation — no I/O, no DB calls.
 * Called by the ingest API after a successful DB write to determine which
 * system_notifications to create.
 */

import type { ParsedReport } from '@/lib/parser/types';
import type { Tables } from '@/lib/db/types';
import {
  computeStatus,
  type DeviceMetrics,
  type StatusResult,
  type AlertThresholds,
} from '@/lib/status';

export interface FiredRule {
  rule: Tables<'alert_rules'>;
  /** The computed metric value that triggered the rule. */
  metricValue: number;
}

export interface AlertEvalResult {
  metrics: DeviceMetrics;
  firedRules: FiredRule[];
  status: StatusResult;
}

/** Extract DeviceMetrics from a parsed report. reportDate is used to compute daysSinceCleaning. */
export function extractMetrics(report: ParsedReport, reportDate: Date): DeviceMetrics {
  // /data post-comp capacity row (active tier) — the primary capacity metric
  const dataSnap = report.capacitySnapshots.find(
    s => s.tier === 'active' && /\/data/i.test(s.resource) && /post.?comp/i.test(s.resource),
  ) ?? report.capacitySnapshots.find(s => s.tier === 'active' && /\/data/i.test(s.resource));

  const usePct = dataSnap?.usePct ?? undefined;
  const availGib = dataSnap?.availGib ?? null;

  // Runway: avail_gib / (postcomp_last_7_days / 7)
  const last7 = report.compressionStats.find(s => s.period === 'last_7_days');
  let runwayDays: number | undefined;
  if (availGib != null && last7 != null && last7.postcompGib > 0) {
    runwayDays = availGib / (last7.postcompGib / 7);
  }

  // Swap usage
  let swapUsedPct: number | undefined;
  if (report.swapTotalMib != null && report.swapFreeMib != null && report.swapTotalMib > 0) {
    swapUsedPct = ((report.swapTotalMib - report.swapFreeMib) / report.swapTotalMib) * 100;
  }

  const hasCriticalAlert = report.deviceAlerts.some(a => a.isActive && a.severity === 'CRITICAL');
  const hasWarningAlert = report.deviceAlerts.some(a => a.isActive && a.severity === 'WARNING');
  const hasInterfaceFault = report.networkInterfaces.some(i => i.state === 'fault');

  let daysSinceCleaning: number | undefined;
  if (report.lastCleaningAt != null) {
    const diffMs = reportDate.getTime() - report.lastCleaningAt.getTime();
    daysSinceCleaning = Math.max(0, Math.floor(diffMs / 86_400_000));
  }

  return {
    hasReportToday: true,
    usePct: usePct !== undefined ? usePct : undefined,
    hasCriticalAlert,
    hasWarningAlert,
    hasInterfaceFault,
    runwayDays,
    swapUsedPct,
    daysSinceCleaning,
  };
}

/** Build AlertThresholds from DB rules so computeStatus uses live admin-editable values. */
function buildThresholds(rules: Tables<'alert_rules'>[]): Partial<AlertThresholds> {
  const t: Partial<AlertThresholds> = {};
  for (const r of rules) {
    if (!r.enabled || r.threshold === null) continue;
    switch (r.metric) {
      case 'use_pct':
        if (r.severity === 'warning') t.usePctWarning = Number(r.threshold);
        else if (r.severity === 'critical') t.usePctCritical = Number(r.threshold);
        break;
      case 'swap_used_pct':
        if (r.severity === 'warning') t.swapUsedPctWarning = Number(r.threshold);
        break;
      case 'runway_days':
        if (r.severity === 'warning') t.runwayDaysWarning = Number(r.threshold);
        break;
      case 'days_since_cleaning':
        if (r.severity === 'warning') t.cleaningOverdueDays = Number(r.threshold);
        break;
    }
  }
  return t;
}

/**
 * Evaluate each enabled alert rule against extracted metrics.
 * Returns the metrics, every rule that fired, and the aggregate device status.
 */
export function evaluateAlertRules(
  report: ParsedReport,
  rules: Tables<'alert_rules'>[],
  reportDate: Date,
): AlertEvalResult {
  const metrics = extractMetrics(report, reportDate);

  const metricMap: Record<string, number | undefined> = {
    use_pct: metrics.usePct,
    swap_used_pct: metrics.swapUsedPct,
    runway_days: metrics.runwayDays,
    device_alert_critical: report.deviceAlerts.filter(a => a.isActive && a.severity === 'CRITICAL')
      .length,
    interface_fault: report.networkInterfaces.filter(i => i.state === 'fault').length,
    days_since_cleaning: metrics.daysSinceCleaning,
  };

  const firedRules: FiredRule[] = [];
  for (const rule of rules) {
    if (!rule.enabled || rule.threshold === null) continue;
    const val = metricMap[rule.metric];
    if (val === undefined) continue;
    const t = Number(rule.threshold);
    let fired = false;
    switch (rule.operator) {
      case '>':  fired = val > t;  break;
      case '>=': fired = val >= t; break;
      case '<':  fired = val < t;  break;
      case '<=': fired = val <= t; break;
      case '=':  fired = val === t; break;
    }
    if (fired) firedRules.push({ rule, metricValue: val });
  }

  const status = computeStatus(metrics, buildThresholds(rules));
  return { metrics, firedRules, status };
}
