import { describe, it, expect } from 'vitest';
import { computeStatus, DEFAULT_THRESHOLDS } from './status';
import type { DeviceMetrics } from './status';

const healthy: DeviceMetrics = {
  hasReportToday: true,
  usePct: 50,
  hasCriticalAlert: false,
  hasWarningAlert: false,
  hasInterfaceFault: false,
  runwayDays: 180,
  swapUsedPct: 20,
  daysSinceCleaning: 5,
};

// ─── GRAY ────────────────────────────────────────────────────────────────────

describe('GRAY — no report today', () => {
  it('returns GRAY / NO REPORT when hasReportToday is false', () => {
    const r = computeStatus({ hasReportToday: false });
    expect(r.status).toBe('GRAY');
    expect(r.label).toBe('NO REPORT');
  });

  it('GRAY takes precedence even when metrics look critical', () => {
    const r = computeStatus({ hasReportToday: false, hasCriticalAlert: true, usePct: 99 });
    expect(r.status).toBe('GRAY');
  });
});

// ─── RED ─────────────────────────────────────────────────────────────────────

describe('RED — critical conditions', () => {
  it('critical device alert → RED', () => {
    const r = computeStatus({ ...healthy, hasCriticalAlert: true });
    expect(r.status).toBe('RED');
    expect(r.label).toBe('CRITICAL');
  });

  it('use_pct at critical threshold (>= 90) → RED', () => {
    const r = computeStatus({ ...healthy, usePct: 90 });
    expect(r.status).toBe('RED');
  });

  it('use_pct above critical threshold → RED', () => {
    const r = computeStatus({ ...healthy, usePct: 95 });
    expect(r.status).toBe('RED');
  });

  it('interface fault → RED', () => {
    const r = computeStatus({ ...healthy, hasInterfaceFault: true });
    expect(r.status).toBe('RED');
    expect(r.label).toBe('CRITICAL');
  });

  it('multiple RED triggers → RED', () => {
    const r = computeStatus({ ...healthy, hasCriticalAlert: true, usePct: 99, hasInterfaceFault: true });
    expect(r.status).toBe('RED');
  });

  it('RED overrides AMBER when both triggered', () => {
    const r = computeStatus({ ...healthy, hasCriticalAlert: true, hasWarningAlert: true });
    expect(r.status).toBe('RED');
  });
});

// ─── AMBER ───────────────────────────────────────────────────────────────────

describe('AMBER — warning conditions', () => {
  it('warning device alert → AMBER', () => {
    const r = computeStatus({ ...healthy, hasWarningAlert: true });
    expect(r.status).toBe('AMBER');
    expect(r.label).toBe('WARNING');
  });

  it('use_pct at warning threshold (>= 80) → AMBER', () => {
    const r = computeStatus({ ...healthy, usePct: 80 });
    expect(r.status).toBe('AMBER');
  });

  it('use_pct between 80 and 89.999 → AMBER (not RED)', () => {
    const r = computeStatus({ ...healthy, usePct: 89.9 });
    expect(r.status).toBe('AMBER');
  });

  it('runway below threshold (< 60) → AMBER', () => {
    const r = computeStatus({ ...healthy, runwayDays: 59 });
    expect(r.status).toBe('AMBER');
  });

  it('runway at exactly 60 days → GREEN (boundary: not < 60)', () => {
    const r = computeStatus({ ...healthy, runwayDays: 60 });
    expect(r.status).toBe('GREEN');
  });

  it('swap_used_pct at warning threshold (>= 95) → AMBER', () => {
    const r = computeStatus({ ...healthy, swapUsedPct: 95 });
    expect(r.status).toBe('AMBER');
  });

  it('swap_used_pct below 95 → GREEN', () => {
    const r = computeStatus({ ...healthy, swapUsedPct: 94.9 });
    expect(r.status).toBe('GREEN');
  });

  it('cleaning overdue (> 30 days) → AMBER', () => {
    const r = computeStatus({ ...healthy, daysSinceCleaning: 31 });
    expect(r.status).toBe('AMBER');
  });

  it('cleaning at exactly 30 days → GREEN (boundary: not > 30)', () => {
    const r = computeStatus({ ...healthy, daysSinceCleaning: 30 });
    expect(r.status).toBe('GREEN');
  });

  it('multiple AMBER triggers → AMBER', () => {
    const r = computeStatus({ ...healthy, runwayDays: 10, swapUsedPct: 97 });
    expect(r.status).toBe('AMBER');
  });
});

// ─── GREEN ───────────────────────────────────────────────────────────────────

describe('GREEN — all healthy', () => {
  it('returns GREEN / HEALTHY when all metrics are within bounds', () => {
    const r = computeStatus(healthy);
    expect(r.status).toBe('GREEN');
    expect(r.label).toBe('HEALTHY');
  });

  it('returns GREEN when optional metrics are absent', () => {
    const r = computeStatus({ hasReportToday: true });
    expect(r.status).toBe('GREEN');
  });
});

// ─── CUSTOM THRESHOLDS ───────────────────────────────────────────────────────

describe('custom threshold overrides', () => {
  it('lower critical use_pct threshold triggers RED earlier', () => {
    const r = computeStatus({ ...healthy, usePct: 85 }, { usePctCritical: 85 });
    expect(r.status).toBe('RED');
  });

  it('higher warning use_pct threshold keeps GREEN when default would be AMBER', () => {
    const r = computeStatus({ ...healthy, usePct: 82 }, { usePctWarning: 85 });
    expect(r.status).toBe('GREEN');
  });

  it('custom runway threshold: higher limit triggers AMBER', () => {
    const r = computeStatus({ ...healthy, runwayDays: 70 }, { runwayDaysWarning: 90 });
    expect(r.status).toBe('AMBER');
  });

  it('custom cleaning overdue threshold', () => {
    const r = computeStatus({ ...healthy, daysSinceCleaning: 20 }, { cleaningOverdueDays: 15 });
    expect(r.status).toBe('AMBER');
  });

  it('custom swap threshold', () => {
    const r = computeStatus({ ...healthy, swapUsedPct: 80 }, { swapUsedPctWarning: 80 });
    expect(r.status).toBe('AMBER');
  });

  it('partial override leaves remaining thresholds at default', () => {
    const r = computeStatus({ ...healthy, usePct: 90 }, { usePctWarning: 85 });
    expect(r.status).toBe('RED');
  });
});

// ─── DEFAULT_THRESHOLDS export ───────────────────────────────────────────────

describe('DEFAULT_THRESHOLDS', () => {
  it('matches seeded alert_rules values', () => {
    expect(DEFAULT_THRESHOLDS.usePctWarning).toBe(80);
    expect(DEFAULT_THRESHOLDS.usePctCritical).toBe(90);
    expect(DEFAULT_THRESHOLDS.swapUsedPctWarning).toBe(95);
    expect(DEFAULT_THRESHOLDS.runwayDaysWarning).toBe(60);
    expect(DEFAULT_THRESHOLDS.cleaningOverdueDays).toBe(30);
  });
});
