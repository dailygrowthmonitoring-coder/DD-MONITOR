import { describe, it, expect } from 'vitest';
import { extractMetrics, evaluateAlertRules } from '../alertEval';
import type { ParsedReport } from '@/lib/parser/types';
import type { Tables } from '@/lib/db/types';

// Minimal report with realistic values
function makeReport(overrides: Partial<ParsedReport> = {}): ParsedReport {
  return {
    hostname: 'DDBag.iq.zain.com',
    generatedAt: new Date('2026-06-14T09:00:00Z'),
    reportDate: '2026-06-14',
    timeZone: 'Asia/Baghdad',
    osVersion: '7.7.1.60',
    serialNo: 'ABC001',
    chassisSerial: null,
    modelNo: 'DD6300',
    displayName: 'DDBag',
    adminEmail: null,
    location: null,
    uptimeDays: 120,
    loadAvg1m: 1.5,
    loadAvg5m: 1.2,
    loadAvg15m: 1.0,
    memTotalMib: 32768,
    memFreeMib: 8192,
    swapTotalMib: 4096,
    swapFreeMib: 4096,
    systemAvailabilityPct: 99.9,
    fsAvailabilityPct: 99.8,
    lastCleaningAt: null,
    capacitySnapshots: [
      {
        tier: 'active',
        resource: '/data: post-comp',
        sizeGib: 100000,
        usedGib: 75000,
        availGib: 25000,
        usePct: 75,
        cleanableGib: null,
      },
    ],
    compressionStats: [
      {
        period: 'currently_used',
        precompGib: 1000000,
        postcompGib: 75000,
        globalCompFactor: null,
        localCompFactor: null,
        totalCompFactor: 13.3,
        reductionPct: 92.5,
      },
      {
        period: 'last_7_days',
        precompGib: 50000,
        postcompGib: 2000, // runway = 25000 / (2000/7) ≈ 87.5 days — above warning threshold
        globalCompFactor: 10.0,
        localCompFactor: 2.0,
        totalCompFactor: 10.0,
        reductionPct: 90.0,
      },
      {
        period: 'last_24_hrs',
        precompGib: 7000,
        postcompGib: 700,
        globalCompFactor: 10.0,
        localCompFactor: 2.0,
        totalCompFactor: 10.0,
        reductionPct: 90.0,
      },
    ],
    deviceAlerts: [],
    networkInterfaces: [],
    disks: null,
    mtrees: [],
    warnings: [],
    ...overrides,
  };
}

// Seeded rules matching 0001_initial_schema.sql seed data
const SEEDED_RULES: Tables<'alert_rules'>[] = [
  { id: '1', name: 'Capacity warning',      metric: 'use_pct',              operator: '>=', threshold: 80,  severity: 'warning',  enabled: true, created_at: '', updated_at: '' },
  { id: '2', name: 'Capacity critical',     metric: 'use_pct',              operator: '>=', threshold: 90,  severity: 'critical', enabled: true, created_at: '', updated_at: '' },
  { id: '3', name: 'Swap warning',          metric: 'swap_used_pct',        operator: '>=', threshold: 95,  severity: 'warning',  enabled: true, created_at: '', updated_at: '' },
  { id: '4', name: 'Runway warning',        metric: 'runway_days',          operator: '<',  threshold: 60,  severity: 'warning',  enabled: true, created_at: '', updated_at: '' },
  { id: '5', name: 'Critical device alert', metric: 'device_alert_critical',operator: '>=', threshold: 1,   severity: 'critical', enabled: true, created_at: '', updated_at: '' },
  { id: '6', name: 'Interface fault',       metric: 'interface_fault',      operator: '>=', threshold: 1,   severity: 'critical', enabled: true, created_at: '', updated_at: '' },
  { id: '7', name: 'Cleaning overdue',      metric: 'days_since_cleaning',  operator: '>',  threshold: 30,  severity: 'warning',  enabled: true, created_at: '', updated_at: '' },
];

const REPORT_DATE = new Date('2026-06-14T12:00:00Z');

describe('extractMetrics', () => {
  it('returns hasReportToday=true always', () => {
    const m = extractMetrics(makeReport(), REPORT_DATE);
    expect(m.hasReportToday).toBe(true);
  });

  it('extracts usePct from /data post-comp snapshot', () => {
    const m = extractMetrics(makeReport(), REPORT_DATE);
    expect(m.usePct).toBe(75);
  });

  it('computes runway from availGib and last_7_days postcompGib', () => {
    // availGib=25000, last_7_days postcompGib=2000 → runway = 25000 / (2000/7) ≈ 87.5 days
    const m = extractMetrics(makeReport(), REPORT_DATE);
    expect(m.runwayDays).toBeCloseTo(87.5, 0);
  });

  it('returns runwayDays=undefined when no compression stats', () => {
    const m = extractMetrics(makeReport({ compressionStats: [] }), REPORT_DATE);
    expect(m.runwayDays).toBeUndefined();
  });

  it('computes swapUsedPct correctly', () => {
    // swapTotal=4096, swapFree=1024 → used=3072 → 75%
    const m = extractMetrics(
      makeReport({ swapTotalMib: 4096, swapFreeMib: 1024 }),
      REPORT_DATE,
    );
    expect(m.swapUsedPct).toBeCloseTo(75, 1);
  });

  it('returns swapUsedPct=undefined when swap is zero total', () => {
    const m = extractMetrics(
      makeReport({ swapTotalMib: 0, swapFreeMib: 0 }),
      REPORT_DATE,
    );
    expect(m.swapUsedPct).toBeUndefined();
  });

  it('detects hasCriticalAlert from active CRITICAL device alert', () => {
    const m = extractMetrics(
      makeReport({
        deviceAlerts: [
          { alertId: 'p0-1', severity: 'CRITICAL', class: 'Disk', object: 'disk0', message: 'Failed', postedAt: new Date(), isActive: true },
        ],
      }),
      REPORT_DATE,
    );
    expect(m.hasCriticalAlert).toBe(true);
  });

  it('does not flag hasCriticalAlert for cleared (isActive=false) alerts', () => {
    const m = extractMetrics(
      makeReport({
        deviceAlerts: [
          { alertId: 'p0-1', severity: 'CRITICAL', class: 'Disk', object: 'disk0', message: 'Failed', postedAt: new Date(), isActive: false },
        ],
      }),
      REPORT_DATE,
    );
    expect(m.hasCriticalAlert).toBe(false);
  });

  it('detects hasInterfaceFault', () => {
    const m = extractMetrics(
      makeReport({
        networkInterfaces: [{ port: 'eth0', state: 'fault', linkUp: null, speed: null, duplex: null, hardwareAddress: null }],
      }),
      REPORT_DATE,
    );
    expect(m.hasInterfaceFault).toBe(true);
  });

  it('computes daysSinceCleaning', () => {
    const cleaningDate = new Date('2026-05-15T00:00:00Z'); // 30 days before June 14
    const m = extractMetrics(makeReport({ lastCleaningAt: cleaningDate }), REPORT_DATE);
    expect(m.daysSinceCleaning).toBe(30);
  });
});

describe('evaluateAlertRules', () => {
  it('returns GREEN status and no fired rules for healthy device', () => {
    const { firedRules, status } = evaluateAlertRules(makeReport(), SEEDED_RULES, REPORT_DATE);
    expect(status.status).toBe('GREEN');
    expect(firedRules).toHaveLength(0);
  });

  it('fires Capacity warning when use_pct >= 80', () => {
    const report = makeReport({
      capacitySnapshots: [
        { tier: 'active', resource: '/data: post-comp', sizeGib: 100000, usedGib: 82000, availGib: 18000, usePct: 82, cleanableGib: null },
      ],
    });
    const { firedRules, status } = evaluateAlertRules(report, SEEDED_RULES, REPORT_DATE);
    expect(firedRules.some(f => f.rule.name === 'Capacity warning')).toBe(true);
    expect(status.status).toBe('AMBER');
  });

  it('fires Capacity critical when use_pct >= 90, status RED', () => {
    const report = makeReport({
      capacitySnapshots: [
        { tier: 'active', resource: '/data: post-comp', sizeGib: 100000, usedGib: 91000, availGib: 9000, usePct: 91, cleanableGib: null },
      ],
    });
    const { firedRules, status } = evaluateAlertRules(report, SEEDED_RULES, REPORT_DATE);
    expect(firedRules.some(f => f.rule.name === 'Capacity critical')).toBe(true);
    expect(status.status).toBe('RED');
  });

  it('fires Runway warning when runway_days < 60', () => {
    // availGib=9000, last_7_days postcompGib=5000 → runway = 9000/(5000/7) ≈ 12.6
    const report = makeReport({
      capacitySnapshots: [
        { tier: 'active', resource: '/data: post-comp', sizeGib: 100000, usedGib: 91000, availGib: 9000, usePct: 91, cleanableGib: null },
      ],
    });
    const { firedRules } = evaluateAlertRules(report, SEEDED_RULES, REPORT_DATE);
    expect(firedRules.some(f => f.rule.name === 'Runway warning')).toBe(true);
  });

  it('fires Critical device alert when active CRITICAL alert exists', () => {
    const report = makeReport({
      deviceAlerts: [
        { alertId: 'p0-1', severity: 'CRITICAL', class: 'Disk', object: 'disk0', message: 'Failed', postedAt: new Date(), isActive: true },
      ],
    });
    const { firedRules, status } = evaluateAlertRules(report, SEEDED_RULES, REPORT_DATE);
    expect(firedRules.some(f => f.rule.name === 'Critical device alert')).toBe(true);
    expect(status.status).toBe('RED');
  });

  it('fires Interface fault when any interface has state=fault', () => {
    const report = makeReport({
      networkInterfaces: [
        { port: 'eth0', state: 'fault', linkUp: null, speed: null, duplex: null, hardwareAddress: null },
      ],
    });
    const { firedRules, status } = evaluateAlertRules(report, SEEDED_RULES, REPORT_DATE);
    expect(firedRules.some(f => f.rule.name === 'Interface fault')).toBe(true);
    expect(status.status).toBe('RED');
  });

  it('fires Swap warning when swap is nearly full', () => {
    const report = makeReport({ swapTotalMib: 4096, swapFreeMib: 100 });
    const { firedRules } = evaluateAlertRules(report, SEEDED_RULES, REPORT_DATE);
    expect(firedRules.some(f => f.rule.name === 'Swap warning')).toBe(true);
  });

  it('fires Cleaning overdue when days_since_cleaning > 30', () => {
    const cleaning = new Date('2026-04-01T00:00:00Z'); // > 30 days before June 14
    const report = makeReport({ lastCleaningAt: cleaning });
    const { firedRules } = evaluateAlertRules(report, SEEDED_RULES, REPORT_DATE);
    expect(firedRules.some(f => f.rule.name === 'Cleaning overdue')).toBe(true);
  });

  it('skips disabled rules', () => {
    const rules = SEEDED_RULES.map(r => ({ ...r, enabled: false }));
    const report = makeReport({
      capacitySnapshots: [
        { tier: 'active', resource: '/data: post-comp', sizeGib: 100000, usedGib: 95000, availGib: 5000, usePct: 95, cleanableGib: null },
      ],
    });
    const { firedRules } = evaluateAlertRules(report, rules, REPORT_DATE);
    expect(firedRules).toHaveLength(0);
  });
});
