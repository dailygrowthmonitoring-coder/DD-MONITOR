import { describe, it, expect } from 'vitest';
import { extract } from '../sections/diskStates';

// 6.2 style: two tier columns (Active tier | Cache tier)
const DISK_LINES_62 = [
  'Normal - Storage operational',
  'Disk States                      Active tier  Cache tier',
  '  ---------------------------    -----------  ----------',
  '  in use                                  42           4',
  '  spare                                    4           0',
  '  failed                                   0           -',
  '  absent                                   2           -',
  '  ---------------------------    -----------  ----------',
  '  TOTAL DISKS                             48           4',
];

describe('diskStates.extract (6.2 — 2 tier columns)', () => {
  it('sums in-use across both tiers', () => {
    const { data, warnings } = extract(DISK_LINES_62);
    expect(warnings).toHaveLength(0);
    expect(data).not.toBeNull();
    expect(data!.disksInUse).toBe(46);   // 42 + 4
    expect(data!.disksSpare).toBe(4);    // 4 + 0
    expect(data!.disksFailed).toBe(0);   // 0 + '-'=0
    expect(data!.disksAbsent).toBe(2);   // 2 + '-'=0
  });

  it('captures reliability note', () => {
    const { data } = extract(DISK_LINES_62);
    expect(data!.reliabilityNotes).toContain('Normal - Storage operational');
  });
});

// 7.13 style: five tier columns
const DISK_LINES_713 = [
  'Normal - Storage operational',
  'Disk States              Active tier  Head unit  Other  Cache tier  Cloud tier',
  '  --------------------   -----------  ---------  -----  ----------  ----------',
  '  in use                          60          0      0           4           0',
  '  spare                            4          0      0           0           0',
  '  failed                           0          0      0           0           0',
  '  absent                           0          0      0           0           -',
  '  --------------------   -----------  ---------  -----  ----------  ----------',
  '  TOTAL DISKS                     64          0      0           4           0',
];

describe('diskStates.extract (7.13 — 5 tier columns)', () => {
  it('sums in-use across all five tiers', () => {
    const { data } = extract(DISK_LINES_713);
    expect(data!.disksInUse).toBe(64); // 60+0+0+4+0
  });

  it('treats "-" in cloud tier absent as 0', () => {
    const { data } = extract(DISK_LINES_713);
    expect(data!.disksAbsent).toBe(0); // 0+0+0+0+"-"→0
  });
});

describe('diskStates.extract — missing table', () => {
  it('returns null and warning when Disk States table not found', () => {
    const { data, warnings } = extract(['Nothing relevant here']);
    expect(data).toBeNull();
    expect(warnings.some(w => /Disk States table not found/.test(w))).toBe(true);
  });
});
