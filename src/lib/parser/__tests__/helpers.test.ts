import { describe, it, expect } from 'vitest';
import {
  getColBounds,
  extractCols,
  extractColsExtended,
  parseNum,
  parsePct,
  parseFactor,
  parseTotalFactor,
  parseDeviceLocalTime,
  parseCleaningDate,
} from '../helpers';

describe('getColBounds', () => {
  it('parses a multi-group dash line', () => {
    const bounds = getColBounds('------   --------   -----------');
    expect(bounds).toEqual([
      { start: 0, end: 6 },
      { start: 9, end: 17 },
      { start: 20, end: 31 },
    ]);
  });
});

describe('extractCols / extractColsExtended', () => {
  const bounds = getColBounds('------   --------   -----------');
  it('extractCols trims within dash bounds', () => {
    const cols = extractCols('p0-258   CRITICAL    some message', bounds);
    expect(cols[0]).toBe('p0-258');
    expect(cols[1]).toBe('CRITICAL');
  });
  it('extractColsExtended extends last column to end of line', () => {
    const cols = extractColsExtended('p0-258   CRITICAL    long message here', bounds);
    expect(cols[2]).toBe('long message here');
  });
});

describe('parseNum', () => {
  it('returns null for dash', () => expect(parseNum('-')).toBeNull());
  it('returns null for empty string', () => expect(parseNum('')).toBeNull());
  it('strips trailing asterisk', () => expect(parseNum('129980.7*')).toBe(129980.7));
  it('parses normal number', () => expect(parseNum('27204.6')).toBe(27204.6));
  it('returns null for dash with spaces', () => expect(parseNum('   -   ')).toBeNull());
});

describe('parsePct', () => {
  it('strips percent sign', () => expect(parsePct('64%')).toBe(64));
  it('returns null for dash', () => expect(parsePct('-')).toBeNull());
  it('handles zero percent', () => expect(parsePct('0%')).toBe(0));
  it('returns null for empty', () => expect(parsePct('')).toBeNull());
});

describe('parseFactor', () => {
  it('strips trailing x', () => expect(parseFactor('53.2x')).toBe(53.2));
  it('returns null for dash', () => expect(parseFactor('-')).toBeNull());
  it('parses integer factor', () => expect(parseFactor('2x')).toBe(2));
});

describe('parseTotalFactor', () => {
  it('parses "128.5x (99.2)"', () => {
    expect(parseTotalFactor('128.5x (99.2)')).toEqual({ factor: 128.5, reduction: 99.2 });
  });
  it('parses "45.3x (97.8)"', () => {
    expect(parseTotalFactor('45.3x (97.8)')).toEqual({ factor: 45.3, reduction: 97.8 });
  });
  it('returns null for dash', () => expect(parseTotalFactor('-')).toBeNull());
  it('returns null for empty', () => expect(parseTotalFactor('')).toBeNull());
});

describe('parseDeviceLocalTime', () => {
  it('converts Baghdad local time to UTC (UTC+3)', () => {
    // Baghdad is UTC+3; 06:02:13 local = 03:02:13 UTC
    const d = parseDeviceLocalTime('Wed Jun 10 06:02:13 2026', 'Asia/Baghdad');
    expect(d).not.toBeNull();
    expect(d!.toISOString()).toBe('2026-06-10T03:02:13.000Z');
  });
  it('returns null for invalid input', () => {
    expect(parseDeviceLocalTime('not a date', 'Asia/Baghdad')).toBeNull();
  });
});

describe('parseCleaningDate', () => {
  it('converts "YYYY/MM/DD HH:MM:SS" in Baghdad to UTC', () => {
    const d = parseCleaningDate('2026/06/09 08:08:07', 'Asia/Baghdad');
    expect(d).not.toBeNull();
    expect(d!.toISOString()).toBe('2026-06-09T05:08:07.000Z');
  });
});
