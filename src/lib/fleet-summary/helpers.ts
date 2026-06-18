/**
 * Pure, stateless helpers for the fleet-summary endpoint.
 * No I/O — only types and computation.
 */

import type { DeviceMetrics, AlertThresholds } from '@/lib/status';
import type { Tables } from '@/lib/db/types';

export const ORDERED_GROUPS = ['BAG', 'OFFSET', 'AVAMAR'] as const;
export type FleetGroup = (typeof ORDERED_GROUPS)[number];

// ─── Response shape (returned by GET /api/fleet-summary) ──────────────────────

export interface GroupSummary {
  name: FleetGroup;
  /** True when at least one device in this group has a report for today. */
  reportReceived: boolean;
  /** generated_at of the most recent today report for this group; null if missing. */
  reportTime: string | null;
}

export interface DeviceSummary {
  id: string;
  hostname: string;
  displayName: string | null;
  group: string | null;
  status: 'CRITICAL' | 'WARNING' | 'HEALTHY' | 'NO REPORT';
  /** Human-readable explanation for any non-HEALTHY status (null when HEALTHY or NO REPORT). */
  statusReason: string | null;
  usePct: number | null;
  lastReportDate: string | null;
  /** generated_at from the report (appliance-local timestamp, ISO string). */
  reportTime: string | null;
}

export interface IssueSummary {
  deviceId: string;
  hostname: string;
  displayName: string | null;
  group: string | null;
  severity: 'CRITICAL' | 'WARNING';
  alertClass: string;
  alertObject: string;
  message: string;
}

export interface FleetCounts {
  critical: number;
  warning: number;
  healthy: number;
  missing: number;
}

export interface FleetSummaryData {
  date: string;
  groups: GroupSummary[];
  /** Distinct groups that have at least one today report. */
  reportsReceived: number;
  /** Distinct groups that have at least one active device. */
  reportsExpected: number;
  counts: FleetCounts;
  devices: DeviceSummary[];
  /** Active device alerts (CRITICAL + WARNING) from today's reports. */
  issues: IssueSummary[];
}

// ─── Pure helpers ──────────────────────────────────────────────────────────────

/**
 * Returns a one-line human-readable reason explaining why a device is non-HEALTHY.
 * Priority order mirrors computeStatus() exactly so the email agrees with the dashboard.
 * Returns null for devices that are HEALTHY or have no report today.
 */
export function buildStatusReason(
  metrics: DeviceMetrics,
  thresholds: AlertThresholds,
  alerts: Pick<Tables<'device_alerts'>, 'severity' | 'class' | 'object' | 'message'>[],
): string | null {
  if (!metrics.hasReportToday) return null;

  // RED conditions (mirror computeStatus priority)
  const critAlert = alerts.find(a => a.severity === 'CRITICAL');
  if (critAlert) {
    return `${critAlert['class']}: ${critAlert.message.slice(0, 100)}`;
  }
  if (metrics.usePct !== undefined && metrics.usePct >= thresholds.usePctCritical) {
    return `Capacity critical (${Math.round(metrics.usePct)}%)`;
  }
  if (metrics.hasInterfaceFault) {
    return 'Network interface fault';
  }

  // AMBER conditions
  const warnAlert = alerts.find(a => a.severity === 'WARNING');
  if (warnAlert) {
    return `${warnAlert['class']}: ${warnAlert.message.slice(0, 100)}`;
  }
  if (metrics.usePct !== undefined && metrics.usePct >= thresholds.usePctWarning) {
    return `Capacity warning (${Math.round(metrics.usePct)}%)`;
  }
  if (metrics.runwayDays !== undefined && metrics.runwayDays < thresholds.runwayDaysWarning) {
    return `Low runway (${Math.round(metrics.runwayDays)} days)`;
  }
  if (metrics.swapUsedPct !== undefined && metrics.swapUsedPct >= thresholds.swapUsedPctWarning) {
    return `Swap usage high (${Math.round(metrics.swapUsedPct)}%)`;
  }
  if (metrics.daysSinceCleaning !== undefined && metrics.daysSinceCleaning > thresholds.cleaningOverdueDays) {
    return `Cleaning overdue (${metrics.daysSinceCleaning} days)`;
  }

  return null;
}

/**
 * Counts devices by status tier.
 */
export function computeCounts(
  statuses: Array<'CRITICAL' | 'WARNING' | 'HEALTHY' | 'NO REPORT'>,
): FleetCounts {
  let critical = 0, warning = 0, healthy = 0, missing = 0;
  for (const s of statuses) {
    if      (s === 'CRITICAL')  critical++;
    else if (s === 'WARNING')   warning++;
    else if (s === 'HEALTHY')   healthy++;
    else                        missing++;
  }
  return { critical, warning, healthy, missing };
}

/**
 * Builds one GroupSummary per known group from the device + report maps.
 * A group is "received" when at least one device in that group has a today report.
 * reportTime is the most recent generated_at among today's reports for that group.
 */
export function computeGroupSummaries(
  devices: { id: string; device_group: string | null }[],
  reportByDeviceId: Map<string, { generated_at: string }>,
): GroupSummary[] {
  return ORDERED_GROUPS.map(g => {
    const groupDevices = devices.filter(d => d.device_group === g);
    const todayReports = groupDevices
      .map(d => reportByDeviceId.get(d.id))
      .filter((r): r is { generated_at: string } => r !== undefined);
    const reportReceived = todayReports.length > 0;
    const reportTime = reportReceived
      ? [...todayReports].sort((a, b) => b.generated_at.localeCompare(a.generated_at))[0].generated_at
      : null;
    return { name: g, reportReceived, reportTime };
  });
}
