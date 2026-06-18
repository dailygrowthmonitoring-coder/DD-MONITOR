import { describe, it, expect } from 'vitest';
import { extract } from '../sections/alerts';

const TZ = 'Asia/Baghdad'; // UTC+3

// Current Alerts table (6 col groups)
const CURRENT_ALERT_LINES = [
  '  Id              Post Time                 Severity   Class    Object         Message',
  '  --------------  ------------------------  ---------  -------  -------------  ----------------------',
  '  p0-258          Thu Jun 05 08:31:17 2026  CRITICAL   ENV      SYS            Fan Failure detected',
  '  p0-259          Thu Jun 05 08:32:00 2026  WARNING    FILESYS  /data          Cleaning recommended',
  '  --------------  ------------------------  ---------  -------  -------------  ----------------------',
];

// Alerts History table (7 col groups — adds Clear Time between Post Time and Severity)
const HISTORY_ALERT_LINES = [
  '  Id              Post Time                 Clear Time                Severity   Class    Object   Message',
  '  --------------  ------------------------  ------------------------  ---------  -------  -------  ----------------------',
  '  p0-200          Wed Jun 01 09:00:00 2026  Wed Jun 01 10:00:00 2026  WARNING    FILESYS  /backup  Space low',
  '  p0-258          Thu Jun 05 08:31:17 2026  -                         CRITICAL   ENV      SYS      Fan Failure detected',
  '  --------------  ------------------------  ------------------------  ---------  -------  -------  ----------------------',
];

describe('alerts.extract', () => {
  it('parses current alerts', () => {
    const { data, warnings } = extract(CURRENT_ALERT_LINES, [], TZ);
    expect(warnings).toHaveLength(0);
    expect(data).toHaveLength(2);
    const crit = data.find(a => a.alertId === 'p0-258');
    expect(crit?.severity).toBe('CRITICAL');
    expect(crit?.isActive).toBe(true);
    expect(crit?.class).toBe('ENV');
    expect(crit?.message).toBe('Fan Failure detected');
  });

  it('parses history alerts', () => {
    const { data } = extract([], HISTORY_ALERT_LINES, TZ);
    const hist = data.find(a => a.alertId === 'p0-200');
    expect(hist?.severity).toBe('WARNING');
    expect(hist?.isActive).toBe(false);
  });

  it('current alert overwrites history when same alertId', () => {
    const { data } = extract(CURRENT_ALERT_LINES, HISTORY_ALERT_LINES, TZ);
    // p0-258 is in both; current wins → isActive=true
    const dup = data.filter(a => a.alertId === 'p0-258');
    expect(dup).toHaveLength(1);
    expect(dup[0].isActive).toBe(true);
    // p0-200 only in history → isActive=false
    const hist = data.find(a => a.alertId === 'p0-200');
    expect(hist?.isActive).toBe(false);
    // p0-259 only in current
    expect(data.find(a => a.alertId === 'p0-259')?.isActive).toBe(true);
  });

  it('converts Baghdad local time correctly', () => {
    const { data } = extract(CURRENT_ALERT_LINES, [], TZ);
    const a = data.find(a => a.alertId === 'p0-258');
    // Thu Jun 05 08:31:17 2026 Baghdad (UTC+3) = 05:31:17 UTC
    expect(a!.postedAt.toISOString()).toBe('2026-06-05T05:31:17.000Z');
  });

  it('normalises "ERROR" to CRITICAL with warning (DD OS 6.2)', () => {
    const errorLines = [
      '  Id    Post Time                 Severity  Class   Object  Message',
      '  ----  ------------------------  --------  ------  ------  -------',
      '  e001  Mon Jun 01 09:00:00 2026  ERROR     SYSTEM  SYS     Something failed',
      '  ----  ------------------------  --------  ------  ------  -------',
    ];
    const { data, warnings } = extract(errorLines, [], TZ);
    expect(data[0]?.severity).toBe('CRITICAL');
    expect(warnings.some(w => /ERROR.*normalised.*CRITICAL/.test(w))).toBe(true);
  });

  it('returns empty array for "No active alerts" message', () => {
    const { data } = extract(['No active alerts'], [], TZ);
    expect(data).toHaveLength(0);
  });

  it('returns empty array for "No historic alerts" message', () => {
    const { data } = extract([], ['No historic alerts found'], TZ);
    expect(data).toHaveLength(0);
  });

  it('skips unknown severity and emits warning', () => {
    const lines = [
      '  Id    Post Time                 Severity  Class   Object  Message',
      '  ----  ------------------------  --------  ------  ------  -------',
      '  x001  Mon Jun 01 09:00:00 2026  UNKNOWN   SYS     SYS     ?',
      '  ----  ------------------------  --------  ------  ------  -------',
    ];
    const { data, warnings } = extract(lines, [], TZ);
    expect(data).toHaveLength(0);
    expect(warnings.some(w => /Unknown alert severity/.test(w))).toBe(true);
  });
});
