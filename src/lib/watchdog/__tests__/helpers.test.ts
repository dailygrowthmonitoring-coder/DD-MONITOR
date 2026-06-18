import { describe, it, expect } from 'vitest';
import { todayBaghdad, baghdadMidnightUtc, subjectGroupHint } from '../helpers';

describe('todayBaghdad', () => {
  it('returns YYYY-MM-DD format string', () => {
    expect(todayBaghdad()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('converts a known UTC timestamp to the correct Baghdad date', () => {
    // 2026-06-15T22:00:00Z = 2026-06-16T01:00:00+03:00 → still June 16 in Baghdad
    const ms = new Date('2026-06-15T22:00:00Z').getTime();
    expect(todayBaghdad(ms)).toBe('2026-06-16');
  });

  it('crosses midnight correctly — UTC 22:59 is still today in Baghdad', () => {
    // 2026-06-15T22:59:00Z = 2026-06-16T01:59:00+03:00 → June 16
    const ms = new Date('2026-06-15T22:59:00Z').getTime();
    expect(todayBaghdad(ms)).toBe('2026-06-16');
  });

  it('detects that UTC 20:59 is still June 15 in Baghdad (before midnight+3)', () => {
    // 2026-06-15T20:59:00Z = 2026-06-15T23:59:00+03:00 → June 15
    const ms = new Date('2026-06-15T20:59:00Z').getTime();
    expect(todayBaghdad(ms)).toBe('2026-06-15');
  });

  it('Baghdad midnight UTC offset: 2026-06-15T21:00:00Z is June 16 in Baghdad', () => {
    // 2026-06-15T21:00:00Z = 2026-06-16T00:00:00+03:00
    const ms = new Date('2026-06-15T21:00:00Z').getTime();
    expect(todayBaghdad(ms)).toBe('2026-06-16');
  });
});

describe('baghdadMidnightUtc', () => {
  it('converts YYYY-MM-DD to the UTC equivalent of Baghdad midnight', () => {
    expect(baghdadMidnightUtc('2026-06-16')).toBe('2026-06-15T21:00:00.000Z');
  });

  it('handles year boundary correctly', () => {
    // Jan 1 midnight Baghdad = Dec 31 21:00 UTC
    expect(baghdadMidnightUtc('2026-01-01')).toBe('2025-12-31T21:00:00.000Z');
  });

  it('handles month boundary', () => {
    expect(baghdadMidnightUtc('2026-07-01')).toBe('2026-06-30T21:00:00.000Z');
  });
});

describe('subjectGroupHint', () => {
  it('returns BAG for exact pattern', () => {
    expect(subjectGroupHint('autosupport-bag daily report')).toBe('BAG');
  });

  it('returns BAG case-insensitively', () => {
    expect(subjectGroupHint('[Autosupport-BAG] DDBag.iq.zain.com')).toBe('BAG');
  });

  it('returns OFFSET for autosupport-offset', () => {
    expect(subjectGroupHint('Autosupport-Offset system status')).toBe('OFFSET');
  });

  it('returns AVAMAR for autosupport-avamar', () => {
    expect(subjectGroupHint('autosupport-avamar report 2026-06-16')).toBe('AVAMAR');
  });

  it('returns null when no known pattern is present', () => {
    expect(subjectGroupHint('Weekly system notification')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(subjectGroupHint('')).toBeNull();
  });
});
