import { describe, it, expect } from 'vitest';
import { extract } from '../sections/generalInfo';

const BASE_LINES = [
  'HOSTNAME = DDAvamar.iq.zain.com',
  'VERSION = 6.2.1.60-616064',
  'GENERATED_EPOCH_TIME = 1781049600',  // 2026-06-10 00:00:00 UTC
  'TIME_ZONE = Asia/Baghdad',
  'SYSTEM_SERIALNO = ABC12345',
  'MODEL_NO = DD2500',
  'UPTIME =  09:00:00 up 344 days, 17:59,  0 users,  load average: 4.22, 3.85, 3.86',
  '',
];

describe('generalInfo.extract', () => {
  it('parses a complete GENERAL INFO block', () => {
    const { data, warnings } = extract(BASE_LINES);
    expect(data).not.toBeNull();
    expect(data!.hostname).toBe('DDAvamar.iq.zain.com');
    expect(data!.displayName).toBe('DDAvamar');
    expect(data!.osVersion).toBe('6.2.1.60-616064');
    expect(data!.timeZone).toBe('Asia/Baghdad');
    expect(data!.serialNo).toBe('ABC12345');
    expect(data!.modelNo).toBe('DD2500');
    expect(data!.uptimeDays).toBe(344);
    expect(data!.loadAvg1m).toBe(4.22);
    expect(data!.loadAvg5m).toBe(3.85);
    expect(data!.loadAvg15m).toBe(3.86);
    expect(warnings).toHaveLength(0);
  });

  it('computes reportDate in device timezone', () => {
    // epoch 1781049600 = 2026-06-10 00:00:00 UTC = 2026-06-10 03:00:00 Baghdad
    const { data } = extract(BASE_LINES);
    expect(data!.reportDate).toBe('2026-06-10');
  });

  it('hard-fails when HOSTNAME is missing', () => {
    const lines = BASE_LINES.filter(l => !l.startsWith('HOSTNAME'));
    const { data, warnings } = extract(lines);
    expect(data).toBeNull();
    expect(warnings[0]).toMatch(/HARD_FAIL.*HOSTNAME/);
  });

  it('hard-fails when GENERATED_EPOCH_TIME is missing', () => {
    const lines = BASE_LINES.filter(l => !l.startsWith('GENERATED_EPOCH_TIME'));
    const { data, warnings } = extract(lines);
    expect(data).toBeNull();
    expect(warnings[0]).toMatch(/HARD_FAIL.*GENERATED_EPOCH_TIME/);
  });

  it('warns and defaults to UTC when TIME_ZONE is missing', () => {
    const lines = BASE_LINES.filter(l => !l.startsWith('TIME_ZONE'));
    const { data, warnings } = extract(lines);
    expect(data).not.toBeNull();
    expect(data!.timeZone).toBe('UTC');
    expect(warnings.some(w => /TIME_ZONE missing/.test(w))).toBe(true);
  });

  it('sets uptimeDays=0 when uptime is less than one day', () => {
    const lines = [
      'HOSTNAME = test.example.com',
      'VERSION = 7.7.1',
      'GENERATED_EPOCH_TIME = 1749513600',
      'TIME_ZONE = UTC',
      'UPTIME =  01:30:00 up 3:12,  1 user,  load average: 1.00, 2.00, 3.00',
      '',
    ];
    const { data } = extract(lines);
    expect(data!.uptimeDays).toBe(0);
  });
});
