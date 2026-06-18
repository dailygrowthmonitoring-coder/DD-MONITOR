import { describe, it, expect } from 'vitest';
import { extract } from '../sections/availability';

describe('availability.extract', () => {
  it('parses system and filesystem availability', () => {
    const lines = [
      'System availability                                     99.489%',
      'System availability excluding controlled downtime       99.489%',
      'Filesystem availability                                 99.446%',
    ];
    const { data, warnings } = extract(lines);
    expect(warnings).toHaveLength(0);
    expect(data?.systemAvailabilityPct).toBe(99.489);
    expect(data?.fsAvailabilityPct).toBe(99.446);
  });

  it('picks first "System availability" — ignores "excluding" variant', () => {
    const lines = [
      'System availability                                     99.0%',
      'System availability excluding controlled downtime       98.0%',
    ];
    const { data } = extract(lines);
    expect(data?.systemAvailabilityPct).toBe(99.0);
  });

  it('returns null for both when no matching lines', () => {
    const { data, warnings } = extract(['Unrelated content']);
    expect(data?.systemAvailabilityPct).toBeNull();
    expect(data?.fsAvailabilityPct).toBeNull();
    expect(warnings.length).toBeGreaterThan(0);
  });

  it('handles empty lines without warning', () => {
    const { data, warnings } = extract([]);
    expect(data?.systemAvailabilityPct).toBeNull();
    expect(warnings).toHaveLength(0);
  });
});
