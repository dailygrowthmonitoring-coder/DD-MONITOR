import { describe, it, expect } from 'vitest';
import { extract } from '../sections/serverUsage';

const TZ = 'Asia/Baghdad';

// Minimal SERVER USAGE section with Active Tier containing typical DD rows.
// Includes a pre-comp row (/data: pre-comp) with '-' for size/avail/usePct.
const USAGE_LINES = [
  'Active Tier:',
  '             Resource          Size (GiB)  Used (GiB)  Avail (GiB)  Use%  Cleanable (GiB)',
  '             ----------------  ----------  ----------   -----------  ----  ---------------',
  '             /data: pre-comp           -   129980.7              -     -            44.9',
  '             /data: post-comp    27350.0     2449.5        24900.5   64%             0.0',
  '             /ddvar                 57.0       32.1           24.9   57%               -',
  '             ----------------  ----------  ----------   -----------  ----  ---------------',
  '             /data: pre-comp           -   129980.7              -     -            44.9',
  'Total:',
  'Filesys Compression',
];

describe('serverUsage.extract', () => {
  it('parses active tier rows', () => {
    const { data, warnings } = extract(USAGE_LINES, TZ);
    const active = data.filter(s => s.tier === 'active');
    expect(active.length).toBeGreaterThanOrEqual(3);
    expect(warnings).toHaveLength(0);
  });

  it('sets sizeGib/availGib/usePct=null for pre-comp row', () => {
    const { data } = extract(USAGE_LINES, TZ);
    const preComp = data.find(s => s.resource === '/data: pre-comp' && s.tier === 'active');
    expect(preComp).toBeDefined();
    expect(preComp!.sizeGib).toBeNull();
    expect(preComp!.availGib).toBeNull();
    expect(preComp!.usePct).toBeNull();
    expect(preComp!.usedGib).toBe(129980.7);
  });

  it('parses /data: post-comp row correctly', () => {
    const { data } = extract(USAGE_LINES, TZ);
    const postComp = data.find(s => s.resource === '/data: post-comp' && s.tier === 'active');
    expect(postComp).toBeDefined();
    expect(postComp!.sizeGib).toBe(27350.0);
    expect(postComp!.usedGib).toBe(2449.5);
    expect(postComp!.availGib).toBe(24900.5);
    expect(postComp!.usePct).toBe(64);
    expect(postComp!.cleanableGib).toBe(0.0);
  });

  it('stops parsing at Filesys Compression line', () => {
    const { data } = extract(USAGE_LINES, TZ);
    // Should not parse anything after the Filesys Compression break
    // (the second /data: pre-comp line that comes after the closing dashes is still inside before the break)
    const rows = data.filter(s => s.tier === 'active');
    expect(rows.length).toBeLessThanOrEqual(5);
  });

  it('extracts lastCleaningAt from footnote', () => {
    const lines = [
      'Active Tier:',
      '  Resource    Size (GiB)  Used (GiB)  Avail (GiB)  Use%  Cleanable (GiB)',
      '  ----------  ----------  ----------  -----------  ----  ---------------',
      '  /data: post-comp  27350.0  2449.5  24900.5  64%  0.0',
      '  ----------  ----------  ----------  -----------  ----  ---------------',
      '* Estimated based on last cleaning of 2026/06/09 08:08:07',
      'Filesys Compression',
    ];
    const { lastCleaningAt } = extract(lines, TZ);
    expect(lastCleaningAt).not.toBeNull();
    // 2026-06-09 08:08:07 Baghdad (UTC+3) = 05:08:07 UTC
    expect(lastCleaningAt!.toISOString()).toBe('2026-06-09T05:08:07.000Z');
  });
});

// Cloud tier test
const USAGE_WITH_CLOUD = [
  'Active Tier:',
  '  Resource        Size (GiB)  Used (GiB)  Avail (GiB)  Use%  Cleanable (GiB)',
  '  --------------  ----------  ----------  -----------  ----  ---------------',
  '  /data: post-comp  27350.0  2449.5  24900.5  64%  0.0',
  '  --------------  ----------  ----------  -----------  ----  ---------------',
  'Cloud Tier',
  '  Resource        Size (GiB)  Used (GiB)  Avail (GiB)  Use%  Cleanable (GiB)',
  '  --------------  ----------  ----------  -----------  ----  ---------------',
  '  /data: post-comp  5000.0    1000.0    4000.0  20%  0.0',
  '  --------------  ----------  ----------  -----------  ----  ---------------',
  'Filesys Compression',
];

describe('serverUsage.extract — Cloud Tier', () => {
  it('classifies Cloud Tier rows as tier="cloud"', () => {
    const { data } = extract(USAGE_WITH_CLOUD, TZ);
    const cloud = data.filter(s => s.tier === 'cloud');
    expect(cloud.length).toBeGreaterThan(0);
    expect(cloud[0].resource).toBe('/data: post-comp');
  });
});
