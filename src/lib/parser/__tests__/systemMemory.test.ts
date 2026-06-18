import { describe, it, expect } from 'vitest';
import { extract } from '../sections/systemMemory';

describe('systemMemory.extract', () => {
  it('parses 6.2 style with "Free memory:"', () => {
    const lines = [
      'Total memory: 30000 MiB',
      'Free memory: 15000 MiB',
      'Total swap: 4096 MiB',
      'Free swap: 4096 MiB',
    ];
    const { data, warnings } = extract(lines);
    expect(warnings).toHaveLength(0);
    expect(data?.memTotalMib).toBe(30000);
    expect(data?.memFreeMib).toBe(15000);
    expect(data?.swapTotalMib).toBe(4096);
    expect(data?.swapFreeMib).toBe(4096);
  });

  it('parses 7.x style with "Available memory:"', () => {
    const lines = [
      'Total memory: 62000 MiB',
      'Available memory: 45000 MiB',
      'Total swap: 8192 MiB',
      'Free swap: 8192 MiB',
    ];
    const { data, warnings } = extract(lines);
    expect(warnings).toHaveLength(0);
    expect(data?.memTotalMib).toBe(62000);
    expect(data?.memFreeMib).toBe(45000);
  });

  it('returns nulls (not warning) for empty lines array', () => {
    const { data, warnings } = extract([]);
    expect(data).not.toBeNull();
    expect(warnings).toHaveLength(0); // no lines → no warning (can't parse, but we don't warn)
  });

  it('warns if section has lines but no parseable values', () => {
    const lines = ['Some unrecognized content here'];
    const { data, warnings } = extract(lines);
    expect(data?.memTotalMib).toBeNull();
    expect(warnings.length).toBeGreaterThan(0);
  });
});
