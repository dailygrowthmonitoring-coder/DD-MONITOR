import { describe, it, expect } from 'vitest';
import {
  buildStatusReason,
  computeCounts,
  computeGroupSummaries,
  ORDERED_GROUPS,
} from '../helpers';
import { DEFAULT_THRESHOLDS, type AlertThresholds } from '@/lib/status';

const T: AlertThresholds = { ...DEFAULT_THRESHOLDS };

// ─── buildStatusReason ────────────────────────────────────────────────────────

describe('buildStatusReason', () => {
  it('returns null when no report today (GRAY)', () => {
    expect(buildStatusReason({ hasReportToday: false }, T, [])).toBeNull();
  });

  it('returns null for a fully healthy device (GREEN)', () => {
    expect(buildStatusReason({ hasReportToday: true, usePct: 50 }, T, [])).toBeNull();
  });

  it('returns critical device alert reason (highest RED priority)', () => {
    const alerts = [{ severity: 'CRITICAL', class: 'Disk', object: 'disk0', message: 'Failed disk0' }];
    const reason = buildStatusReason({ hasReportToday: true, hasCriticalAlert: true }, T, alerts as never);
    expect(reason).toBe('Disk: Failed disk0');
  });

  it('returns capacity critical when no device alert', () => {
    expect(buildStatusReason({ hasReportToday: true, usePct: 92 }, T, [])).toBe('Capacity critical (92%)');
  });

  it('returns interface fault reason', () => {
    expect(buildStatusReason({ hasReportToday: true, hasInterfaceFault: true }, T, [])).toBe('Network interface fault');
  });

  it('returns warning device alert reason', () => {
    const alerts = [{ severity: 'WARNING', class: 'Storage', object: 'vol1', message: 'Low space' }];
    const reason = buildStatusReason({ hasReportToday: true, hasWarningAlert: true }, T, alerts as never);
    expect(reason).toBe('Storage: Low space');
  });

  it('returns capacity warning reason', () => {
    expect(buildStatusReason({ hasReportToday: true, usePct: 85 }, T, [])).toBe('Capacity warning (85%)');
  });

  it('returns low runway reason', () => {
    expect(buildStatusReason({ hasReportToday: true, runwayDays: 30 }, T, [])).toBe('Low runway (30 days)');
  });

  it('returns swap usage high reason', () => {
    expect(buildStatusReason({ hasReportToday: true, swapUsedPct: 97 }, T, [])).toBe('Swap usage high (97%)');
  });

  it('returns cleaning overdue reason', () => {
    expect(buildStatusReason({ hasReportToday: true, daysSinceCleaning: 45 }, T, [])).toBe('Cleaning overdue (45 days)');
  });

  it('critical alert beats capacity critical (priority ordering)', () => {
    const alerts = [{ severity: 'CRITICAL', class: 'Disk', object: 'disk0', message: 'Failed' }];
    const reason = buildStatusReason({ hasReportToday: true, hasCriticalAlert: true, usePct: 95 }, T, alerts as never);
    expect(reason).toMatch(/^Disk:/);
  });

  it('capacity critical beats interface fault', () => {
    const reason = buildStatusReason({ hasReportToday: true, usePct: 95, hasInterfaceFault: true }, T, []);
    expect(reason).toBe('Capacity critical (95%)');
  });

  it('truncates very long alert message at 100 chars', () => {
    const longMsg = 'X'.repeat(150);
    const alerts = [{ severity: 'CRITICAL', class: 'Disk', object: 'disk0', message: longMsg }];
    const reason = buildStatusReason({ hasReportToday: true, hasCriticalAlert: true }, T, alerts as never);
    expect(reason!.length).toBeLessThanOrEqual('Disk: '.length + 100);
  });
});

// ─── computeCounts ────────────────────────────────────────────────────────────

describe('computeCounts', () => {
  it('counts all four status tiers', () => {
    const counts = computeCounts(['CRITICAL', 'WARNING', 'HEALTHY', 'NO REPORT', 'HEALTHY', 'CRITICAL']);
    expect(counts).toEqual({ critical: 2, warning: 1, healthy: 2, missing: 1 });
  });

  it('returns all zeros for empty array', () => {
    expect(computeCounts([])).toEqual({ critical: 0, warning: 0, healthy: 0, missing: 0 });
  });

  it('counts all healthy', () => {
    expect(computeCounts(['HEALTHY', 'HEALTHY', 'HEALTHY'])).toEqual({ critical: 0, warning: 0, healthy: 3, missing: 0 });
  });

  it('counts all missing', () => {
    expect(computeCounts(['NO REPORT', 'NO REPORT'])).toEqual({ critical: 0, warning: 0, healthy: 0, missing: 2 });
  });
});

// ─── computeGroupSummaries ────────────────────────────────────────────────────

describe('computeGroupSummaries', () => {
  it('always returns all three groups in BAG→OFFSET→AVAMAR order', () => {
    const summaries = computeGroupSummaries([], new Map());
    expect(summaries.map(s => s.name)).toEqual(['BAG', 'OFFSET', 'AVAMAR']);
  });

  it('marks group received when device has a today report', () => {
    const devices = [{ id: 'dev1', device_group: 'BAG' }];
    const reportMap = new Map([['dev1', { generated_at: '2026-06-16T03:00:00Z' }]]);
    const summaries = computeGroupSummaries(devices, reportMap);
    const bag = summaries.find(s => s.name === 'BAG')!;
    expect(bag.reportReceived).toBe(true);
    expect(bag.reportTime).toBe('2026-06-16T03:00:00Z');
  });

  it('marks group missing when device has no today report', () => {
    const devices = [{ id: 'dev1', device_group: 'OFFSET' }];
    const summaries = computeGroupSummaries(devices, new Map());
    const offset = summaries.find(s => s.name === 'OFFSET')!;
    expect(offset.reportReceived).toBe(false);
    expect(offset.reportTime).toBeNull();
  });

  it('marks group missing when no devices exist for it', () => {
    const devices = [{ id: 'dev1', device_group: 'BAG' }];
    const summaries = computeGroupSummaries(devices, new Map());
    const avamar = summaries.find(s => s.name === 'AVAMAR')!;
    expect(avamar.reportReceived).toBe(false);
    expect(avamar.reportTime).toBeNull();
  });

  it('selects most recent reportTime when group has multiple devices', () => {
    const devices = [
      { id: 'dev1', device_group: 'BAG' },
      { id: 'dev2', device_group: 'BAG' },
    ];
    const reportMap = new Map([
      ['dev1', { generated_at: '2026-06-16T02:00:00Z' }],
      ['dev2', { generated_at: '2026-06-16T05:00:00Z' }],
    ]);
    const bag = computeGroupSummaries(devices, reportMap).find(s => s.name === 'BAG')!;
    expect(bag.reportTime).toBe('2026-06-16T05:00:00Z');
  });
});

// ─── ORDERED_GROUPS constant ──────────────────────────────────────────────────

describe('ORDERED_GROUPS', () => {
  it('contains all three groups in the canonical order', () => {
    expect(ORDERED_GROUPS).toEqual(['BAG', 'OFFSET', 'AVAMAR']);
  });
});
