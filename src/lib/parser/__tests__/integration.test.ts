/**
 * Integration tests for parseReport() against all real DD autosupport fixture files.
 *
 * Fixtures are copied from real fleet reports (2 per OS version × 3 devices + 2 Part B JSONs).
 * These tests are the Phase 2 exit gate (STANDARDS §6/§10).
 *
 * Assertions per fixture:
 *   - ok=true
 *   - hostname parsed correctly
 *   - reportDate parsed in the device's own timezone
 *   - at least one active-tier /data: post-comp row
 *   - exactly three compression periods
 *   - warnings array is accessible (no uncaught exceptions)
 *   - snapshot of the full assembled object (regression guard)
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { parseReport } from '../index';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const FIXTURES_DIR = join(__dirname, '../__fixtures__');

function readFixture(name: string): string {
  return readFileSync(join(FIXTURES_DIR, name), 'utf-8');
}

function readFixtureBinary(name: string): string {
  return readFileSync(join(FIXTURES_DIR, name), 'utf-8');
}

// ─────────────────────────────────────────────────────────────────────────────
// DD OS 6.2 — AVAMAR device (Asia/Baghdad, UTC+3)
// ─────────────────────────────────────────────────────────────────────────────

describe('dd62 avamar 2026-06-10', () => {
  const result = parseReport(readFixture('dd62_avamar_2026-06-10.txt'));

  it('parses successfully', () => {
    expect(result.ok).toBe(true);
  });

  it('has correct type', () => {
    expect(result.ok && result.type).toBe('part_a');
  });

  it('hostname is correct', () => {
    expect(result.ok && result.type === 'part_a' && result.data.hostname).toBe('DDAvamar.iq.zain.com');
  });

  it('reportDate is 2026-06-10 (Baghdad timezone)', () => {
    expect(result.ok && result.type === 'part_a' && result.data.reportDate).toBe('2026-06-10');
  });

  it('has active-tier /data: post-comp row', () => {
    if (!result.ok || result.type !== 'part_a') return;
    const row = result.data.capacitySnapshots.find(
      s => s.resource === '/data: post-comp' && s.tier === 'active',
    );
    expect(row).toBeDefined();
  });

  it('pre-comp row has null size/avail/usePct', () => {
    if (!result.ok || result.type !== 'part_a') return;
    const preComp = result.data.capacitySnapshots.find(
      s => s.resource === '/data: pre-comp' && s.tier === 'active',
    );
    expect(preComp).toBeDefined();
    expect(preComp!.sizeGib).toBeNull();
    expect(preComp!.availGib).toBeNull();
    expect(preComp!.usePct).toBeNull();
  });

  it('has exactly 3 compression periods', () => {
    if (!result.ok || result.type !== 'part_a') return;
    expect(result.data.compressionStats).toHaveLength(3);
    const periods = result.data.compressionStats.map(c => c.period);
    expect(periods).toContain('currently_used');
    expect(periods).toContain('last_7_days');
    expect(periods).toContain('last_24_hrs');
  });

  it('Currently Used row has null globalCompFactor', () => {
    if (!result.ok || result.type !== 'part_a') return;
    const cu = result.data.compressionStats.find(c => c.period === 'currently_used');
    expect(cu!.globalCompFactor).toBeNull();
  });

  it('uses 6.2 "Free memory" label (memFreeMib not null)', () => {
    if (!result.ok || result.type !== 'part_a') return;
    expect(result.data.memFreeMib).not.toBeNull();
  });

  it('has no uncaught exceptions (warnings is array)', () => {
    expect(Array.isArray(result.ok ? result.warnings : [])).toBe(true);
  });

  it('matches snapshot', () => {
    expect(result).toMatchSnapshot();
  });
});

describe('dd62 avamar 2026-06-11', () => {
  const result = parseReport(readFixture('dd62_avamar_2026-06-11.txt'));

  it('parses successfully', () => {
    expect(result.ok).toBe(true);
  });

  it('reportDate is 2026-06-11', () => {
    expect(result.ok && result.type === 'part_a' && result.data.reportDate).toBe('2026-06-11');
  });

  it('has 3 compression periods', () => {
    if (!result.ok || result.type !== 'part_a') return;
    expect(result.data.compressionStats).toHaveLength(3);
  });

  it('has active-tier /data: post-comp', () => {
    if (!result.ok || result.type !== 'part_a') return;
    expect(
      result.data.capacitySnapshots.some(s => s.resource === '/data: post-comp' && s.tier === 'active'),
    ).toBe(true);
  });

  it('matches snapshot', () => {
    expect(result).toMatchSnapshot();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// DD OS 7.7 — OFFSET device (Europe/London, UTC+1 in June = BST)
// ─────────────────────────────────────────────────────────────────────────────

describe('dd77 offset 2026-06-10', () => {
  const result = parseReport(readFixture('dd77_offset_2026-06-10.txt'));

  it('parses successfully', () => {
    expect(result.ok).toBe(true);
  });

  it('hostname is correct', () => {
    expect(result.ok && result.type === 'part_a' && result.data.hostname).toBe('DD9300IBDDC.iq.zain.com');
  });

  it('timezone is Europe/London', () => {
    expect(result.ok && result.type === 'part_a' && result.data.timeZone).toBe('Europe/London');
  });

  it('reportDate is 2026-06-10 (London timezone)', () => {
    expect(result.ok && result.type === 'part_a' && result.data.reportDate).toBe('2026-06-10');
  });

  it('has active-tier /data: post-comp', () => {
    if (!result.ok || result.type !== 'part_a') return;
    expect(
      result.data.capacitySnapshots.some(s => s.resource === '/data: post-comp' && s.tier === 'active'),
    ).toBe(true);
  });

  it('has 3 compression periods', () => {
    if (!result.ok || result.type !== 'part_a') return;
    expect(result.data.compressionStats).toHaveLength(3);
  });

  it('uses 7.x "Available memory" label (memFreeMib not null)', () => {
    if (!result.ok || result.type !== 'part_a') return;
    expect(result.data.memFreeMib).not.toBeNull();
  });

  it('matches snapshot', () => {
    expect(result).toMatchSnapshot();
  });
});

describe('dd77 offset 2026-06-11', () => {
  const result = parseReport(readFixture('dd77_offset_2026-06-11.txt'));

  it('parses successfully', () => {
    expect(result.ok).toBe(true);
  });

  it('reportDate is 2026-06-11 (London timezone)', () => {
    expect(result.ok && result.type === 'part_a' && result.data.reportDate).toBe('2026-06-11');
  });

  it('has 3 compression periods', () => {
    if (!result.ok || result.type !== 'part_a') return;
    expect(result.data.compressionStats).toHaveLength(3);
  });

  it('matches snapshot', () => {
    expect(result).toMatchSnapshot();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// DD OS 7.13 — BAG device (Asia/Baghdad, UTC+3)
// ─────────────────────────────────────────────────────────────────────────────

describe('dd713 bag 2026-06-11', () => {
  const result = parseReport(readFixture('dd713_bag_2026-06-11.txt'));

  it('parses successfully', () => {
    expect(result.ok).toBe(true);
  });

  it('hostname is correct', () => {
    expect(result.ok && result.type === 'part_a' && result.data.hostname).toBe('DD9300.iq.zain.com');
  });

  it('reportDate is 2026-06-11 (Baghdad timezone)', () => {
    expect(result.ok && result.type === 'part_a' && result.data.reportDate).toBe('2026-06-11');
  });

  it('has active-tier /data: post-comp', () => {
    if (!result.ok || result.type !== 'part_a') return;
    expect(
      result.data.capacitySnapshots.some(s => s.resource === '/data: post-comp' && s.tier === 'active'),
    ).toBe(true);
  });

  it('has 3 Active Tier compression periods only', () => {
    if (!result.ok || result.type !== 'part_a') return;
    expect(result.data.compressionStats).toHaveLength(3);
    const periods = result.data.compressionStats.map(c => c.period);
    expect(periods).toContain('currently_used');
    expect(periods).toContain('last_7_days');
    expect(periods).toContain('last_24_hrs');
  });

  it('warns about Cloud Tier block skipped', () => {
    if (!result.ok || result.type !== 'part_a') return;
    expect(result.warnings.some(w => /Cloud Tier.*not stored/.test(w))).toBe(true);
  });

  it('uses 7.13 "Available memory" label (memFreeMib not null)', () => {
    if (!result.ok || result.type !== 'part_a') return;
    expect(result.data.memFreeMib).not.toBeNull();
  });

  it('fiber ports with unknown link are classified as fault', () => {
    if (!result.ok || result.type !== 'part_a') return;
    const unknownLink = result.data.networkInterfaces.filter(n => n.linkUp === null);
    expect(unknownLink.length).toBeGreaterThan(0);
    expect(unknownLink.every(n => n.state === 'fault')).toBe(true);
  });

  it('matches snapshot', () => {
    expect(result).toMatchSnapshot();
  });
});

describe('dd713 bag 2026-06-12', () => {
  const result = parseReport(readFixture('dd713_bag_2026-06-12.txt'));

  it('parses successfully', () => {
    expect(result.ok).toBe(true);
  });

  it('reportDate is 2026-06-12 (Baghdad timezone)', () => {
    expect(result.ok && result.type === 'part_a' && result.data.reportDate).toBe('2026-06-12');
  });

  it('has 3 Active Tier compression periods', () => {
    if (!result.ok || result.type !== 'part_a') return;
    expect(result.data.compressionStats).toHaveLength(3);
  });

  it('matches snapshot', () => {
    expect(result).toMatchSnapshot();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Part B JSON files (DD OS 7.13 companion)
// ─────────────────────────────────────────────────────────────────────────────

describe('dd713 bag part B 2026-06-11', () => {
  const result = parseReport(readFixtureBinary('dd713_bag_partb_2026-06-11.json'));

  it('parses successfully', () => {
    expect(result.ok).toBe(true);
  });

  it('type is part_b', () => {
    expect(result.ok && result.type).toBe('part_b');
  });

  it('hostname is correct', () => {
    expect(result.ok && result.type === 'part_b' && result.data.hostname).toBe('DD9300.iq.zain.com');
  });

  it('generatedAt is a valid Date', () => {
    if (!result.ok || result.type !== 'part_b') return;
    expect(result.data.generatedAt).toBeInstanceOf(Date);
    expect(isNaN(result.data.generatedAt.getTime())).toBe(false);
  });

  it('matches snapshot', () => {
    expect(result).toMatchSnapshot();
  });
});

describe('dd713 bag part B 2026-06-12', () => {
  const result = parseReport(readFixtureBinary('dd713_bag_partb_2026-06-12.json'));

  it('parses successfully', () => {
    expect(result.ok).toBe(true);
  });

  it('type is part_b', () => {
    expect(result.ok && result.type).toBe('part_b');
  });

  it('matches snapshot', () => {
    expect(result).toMatchSnapshot();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Performance: each 2-3.5 MB file must parse in under 2s
// ─────────────────────────────────────────────────────────────────────────────

describe('performance', () => {
  const fixtures = [
    'dd62_avamar_2026-06-10.txt',
    'dd62_avamar_2026-06-11.txt',
    'dd77_offset_2026-06-10.txt',
    'dd77_offset_2026-06-11.txt',
    'dd713_bag_2026-06-11.txt',
    'dd713_bag_2026-06-12.txt',
  ];

  for (const name of fixtures) {
    it(`parses ${name} in under 2000ms`, () => {
      const raw = readFixture(name);
      const start = performance.now();
      parseReport(raw);
      const elapsed = performance.now() - start;
      expect(elapsed).toBeLessThan(2000);
    });
  }
});
