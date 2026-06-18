/**
 * Single source of truth for device status color and label.
 * Used by the dashboard (RSC) and the notification engine (ingest API).
 * Thresholds come from alert_rules with seeded defaults as fallback.
 */

export type DeviceStatus = 'GRAY' | 'RED' | 'AMBER' | 'GREEN';
export type StatusLabel = 'NO REPORT' | 'CRITICAL' | 'WARNING' | 'HEALTHY';

export interface StatusResult {
  status: DeviceStatus;
  label: StatusLabel;
}

/** Threshold overrides loaded from alert_rules; all fields optional — missing ⟹ default. */
export interface AlertThresholds {
  /** use_pct >= this → AMBER. Default: 80 */
  usePctWarning: number;
  /** use_pct >= this → RED. Default: 90 */
  usePctCritical: number;
  /** swap_used_pct >= this → AMBER. Default: 95 */
  swapUsedPctWarning: number;
  /** runway_days < this → AMBER. Default: 60 */
  runwayDaysWarning: number;
  /** days_since_cleaning > this → AMBER. Default: 30 */
  cleaningOverdueDays: number;
}

/** Pre-computed metrics for one device snapshot. All optional except hasReportToday. */
export interface DeviceMetrics {
  /** False when no report row exists for today in the device's own timezone. */
  hasReportToday: boolean;
  /** /data: post-comp use% from capacity_snapshots (active tier). */
  usePct?: number;
  /** True when any device_alert row for today has severity = CRITICAL. */
  hasCriticalAlert?: boolean;
  /** True when any device_alert row for today has severity = WARNING. */
  hasWarningAlert?: boolean;
  /** True when any network_interfaces row for today has state = 'fault'. */
  hasInterfaceFault?: boolean;
  /** Est. runway = avail_gib / (postcomp_gib(last_7_days) / 7). */
  runwayDays?: number;
  /** (swap_total_mib - swap_free_mib) / swap_total_mib * 100. */
  swapUsedPct?: number;
  /** Days since last_cleaning_at in system_health. */
  daysSinceCleaning?: number;
}

export const DEFAULT_THRESHOLDS: Readonly<AlertThresholds> = {
  usePctWarning: 80,
  usePctCritical: 90,
  swapUsedPctWarning: 95,
  runwayDaysWarning: 60,
  cleaningOverdueDays: 30,
};

/**
 * Compute device status from pre-aggregated metrics and optional threshold overrides.
 * Priority: GRAY → RED → AMBER → GREEN (higher severity wins).
 */
export function computeStatus(
  metrics: DeviceMetrics,
  thresholds?: Partial<AlertThresholds>,
): StatusResult {
  const t: AlertThresholds = { ...DEFAULT_THRESHOLDS, ...thresholds };

  if (!metrics.hasReportToday) {
    return { status: 'GRAY', label: 'NO REPORT' };
  }

  if (
    metrics.hasCriticalAlert === true ||
    (metrics.usePct !== undefined && metrics.usePct >= t.usePctCritical) ||
    metrics.hasInterfaceFault === true
  ) {
    return { status: 'RED', label: 'CRITICAL' };
  }

  if (
    metrics.hasWarningAlert === true ||
    (metrics.usePct !== undefined && metrics.usePct >= t.usePctWarning) ||
    (metrics.runwayDays !== undefined && metrics.runwayDays < t.runwayDaysWarning) ||
    (metrics.swapUsedPct !== undefined && metrics.swapUsedPct >= t.swapUsedPctWarning) ||
    (metrics.daysSinceCleaning !== undefined && metrics.daysSinceCleaning > t.cleaningOverdueDays)
  ) {
    return { status: 'AMBER', label: 'WARNING' };
  }

  return { status: 'GREEN', label: 'HEALTHY' };
}
