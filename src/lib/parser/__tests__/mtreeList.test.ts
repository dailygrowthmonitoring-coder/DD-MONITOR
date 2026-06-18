import { describe, it, expect } from 'vitest';
import { extract } from '../sections/mtreeList';

const MTREE_WITH_STATUS = [
  '  Name                       Pre-Comp (GiB)  Status',
  '  -------------------------  --------------  ------',
  '  /backup/ost                      27204.6   RW',
  '  /backup/ost/data                  5600.0   RW',
  '  -------------------------  --------------  ------',
  '  D    : Deleted',
];

const MTREE_NO_STATUS = [
  '  Name                       Pre-Comp (GiB)',
  '  -------------------------  --------------',
  '  /data/col1                       1024.0',
  '  /data/col2                        512.5',
  '  -------------------------  --------------',
];

describe('mtreeList.extract — with Status column', () => {
  it('parses mtrees with status', () => {
    const { data, warnings } = extract(MTREE_WITH_STATUS);
    expect(warnings).toHaveLength(0);
    expect(data).toHaveLength(2);
    expect(data[0].mtreePath).toBe('/backup/ost');
    expect(data[0].precompGib).toBe(27204.6);
    expect(data[0].status).toBe('RW');
  });

  it('stops at legend lines', () => {
    const { data } = extract(MTREE_WITH_STATUS);
    expect(data).toHaveLength(2); // not 3 — legend line excluded
  });
});

describe('mtreeList.extract — without Status column', () => {
  it('sets status=null when column absent', () => {
    const { data } = extract(MTREE_NO_STATUS);
    expect(data).toHaveLength(2);
    expect(data[0].status).toBeNull();
    expect(data[1].precompGib).toBe(512.5);
  });
});

describe('mtreeList.extract — edge cases', () => {
  it('skips non-path rows in data section', () => {
    const lines = [
      '  Name             Pre-Comp (GiB)  Status',
      '  ---------------  --------------  ------',
      '  not-a-path              100.0   RW',
      '  /valid/path             200.0   RW',
      '  ---------------  --------------  ------',
    ];
    const { data } = extract(lines);
    expect(data).toHaveLength(1);
    expect(data[0].mtreePath).toBe('/valid/path');
  });

  it('returns empty for empty input', () => {
    const { data } = extract([]);
    expect(data).toHaveLength(0);
  });
});
