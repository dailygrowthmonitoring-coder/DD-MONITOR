import { describe, it, expect } from 'vitest';
import { extract } from '../sections/filesysCompression';

const TZ = 'Asia/Baghdad';

// Real DD 6.2/7.7 format:
//   - Dashes row starts at col 0 (label column + numeric columns)
//   - "Currently Used:*" label; "Last 7 days" / "Last 24 hrs" with 2-space indent
//   - Total factor format: "45.3x (97.8)" — no % sign in parentheses
const PLAIN_COMP_LINES = [
  '                    Pre-Comp   Post-Comp   Global-Comp   Local-Comp      Total-Comp',
  '                       (GiB)       (GiB)        Factor       Factor          Factor',
  '                                                                      (Reduction %)',
  '----------------   ---------   ---------   -----------   ----------   -------------',
  'Currently Used:*   1233511.1     27204.6             -            -    45.3x (97.8)',
  'Written:                                                                           ',
  '  Last 7 days       517758.2      4021.5         53.5x         2.4x   128.7x (99.2)',
  '  Last 24 hrs        66517.9       530.3         51.0x         2.5x   125.4x (99.2)',
  '----------------   ---------   ---------   -----------   ----------   -------------',
];

describe('filesysCompression.extract (6.2/7.7 style)', () => {
  it('parses all three periods', () => {
    const { data } = extract(PLAIN_COMP_LINES, TZ);
    expect(data).toHaveLength(3);
    expect(data.map(d => d.period)).toEqual(['currently_used', 'last_7_days', 'last_24_hrs']);
  });

  it('sets globalCompFactor=null and localCompFactor=null for Currently Used', () => {
    const { data } = extract(PLAIN_COMP_LINES, TZ);
    const cu = data.find(d => d.period === 'currently_used');
    expect(cu).toBeDefined();
    expect(cu!.globalCompFactor).toBeNull(); // '-' in report
    expect(cu!.localCompFactor).toBeNull();  // '-' in report
    expect(cu!.totalCompFactor).toBe(45.3);
    expect(cu!.reductionPct).toBe(97.8);
    expect(cu!.precompGib).toBe(1233511.1);
    expect(cu!.postcompGib).toBe(27204.6);
  });

  it('parses Last 7 Days factors correctly', () => {
    const { data } = extract(PLAIN_COMP_LINES, TZ);
    const l7 = data.find(d => d.period === 'last_7_days');
    expect(l7!.globalCompFactor).toBe(53.5);
    expect(l7!.localCompFactor).toBe(2.4);
    expect(l7!.totalCompFactor).toBe(128.7);
    expect(l7!.reductionPct).toBe(99.2);
  });

  it('parses Last 24 Hrs factors correctly', () => {
    const { data } = extract(PLAIN_COMP_LINES, TZ);
    const l24 = data.find(d => d.period === 'last_24_hrs');
    expect(l24!.precompGib).toBe(66517.9);
    expect(l24!.postcompGib).toBe(530.3);
    expect(l24!.globalCompFactor).toBe(51.0);
  });
});

// 7.13 style — "Active Tier:" label with Cloud Tier block below (exact real DD format)
const COMP_713_LINES = [
  'Active Tier:',
  '                   Pre-Comp   Post-Comp   Global-Comp   Local-Comp      Total-Comp',
  '                      (GiB)       (GiB)        Factor       Factor          Factor',
  '                                                                     (Reduction %)',
  '----------------   --------   ---------   -----------   ----------   -------------',
  'Currently Used:*   559956.3    266401.5             -            -     2.1x (52.4)',
  'Written:                                                                          ',
  '  Last 7 days       19307.7      3529.5          2.0x         2.7x     5.5x (81.7)',
  '  Last 24 hrs        1275.9       266.3          1.5x         3.2x     4.8x (79.1)',
  '----------------   --------   ---------   -----------   ----------   -------------',
  'Cloud Tier:',
  '                   Pre-Comp   Post-Comp   Global-Comp   Local-Comp      Total-Comp',
  '                      (GiB)       (GiB)        Factor       Factor          Factor',
  '                                                                     (Reduction %)',
  '----------------   --------   ---------   -----------   ----------   -------------',
  'Currently Used:*   215990.3    204880.9             -            -      1.1x (5.1)',
  'Written:                                                                          ',
  '  Last 7 days           0.0          0.0          -            -              -   ',
  '  Last 24 hrs           0.0          0.0          -            -              -   ',
  '----------------   --------   ---------   -----------   ----------   -------------',
];

describe('filesysCompression.extract (7.13 with Active+Cloud Tier)', () => {
  it('extracts only Active Tier and emits warning about Cloud Tier', () => {
    const { data, warnings } = extract(COMP_713_LINES, TZ);
    expect(data).toHaveLength(3);
    expect(warnings.some(w => /Cloud Tier.*not stored/.test(w))).toBe(true);
  });

  it('Active Tier data is correct', () => {
    const { data } = extract(COMP_713_LINES, TZ);
    const cu = data.find(d => d.period === 'currently_used');
    expect(cu!.precompGib).toBe(559956.3);
    expect(cu!.postcompGib).toBe(266401.5);
    expect(cu!.globalCompFactor).toBeNull();
  });

  it('no duplicate periods', () => {
    const { data } = extract(COMP_713_LINES, TZ);
    const periods = data.map(d => d.period);
    expect(new Set(periods).size).toBe(periods.length);
  });
});

describe('filesysCompression.extract — cleaning date footnote', () => {
  it('extracts lastCleaningAt from footnote', () => {
    const lines = [
      ...PLAIN_COMP_LINES,
      ' * Does not include the effects since the last cleaning on 2026/06/09 08:08:07.',
    ];
    const { lastCleaningAt } = extract(lines, TZ);
    expect(lastCleaningAt).not.toBeNull();
    // 2026-06-09 08:08:07 Baghdad (UTC+3) = 05:08:07 UTC
    expect(lastCleaningAt!.toISOString()).toBe('2026-06-09T05:08:07.000Z');
  });
});
