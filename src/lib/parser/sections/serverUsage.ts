import { getColBounds, extractColsExtended, parseNum, parsePct, parseCleaningDate } from '../helpers';
import type { ParsedCapacitySnapshot } from '../types';

/** Extract capacity_snapshots rows from SERVER USAGE section lines. */
export function extract(
  lines: string[],
  timeZone: string,
): {
  data: ParsedCapacitySnapshot[];
  lastCleaningAt: Date | null;
  warnings: string[];
} {
  const warnings: string[] = [];
  const snapshots: ParsedCapacitySnapshot[] = [];
  let lastCleaningAt: Date | null = null;

  type TierState = 'none' | 'active' | 'cloud' | 'total' | 'skip';
  let tierState: TierState = 'none';
  let colBounds = getColBounds(''); // empty initially
  let tableOpen = false;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.trim();

    // ── Tier-label detection ───────────────────────────────────────────────
    if (trimmed === 'Active Tier:') {
      tierState = 'active';
      colBounds = getColBounds('');
      tableOpen = false;
      continue;
    }
    if (trimmed === 'Cloud Tier') {
      // Only the standalone "Cloud Tier" is a tier block; unit-wise is separate
      const next = lines[i + 1]?.trim() ?? '';
      if (/^Resource\b/.test(next) || /^-+/.test(next)) {
        tierState = 'cloud';
        colBounds = getColBounds('');
        tableOpen = false;
      } else {
        tierState = 'skip';
      }
      continue;
    }
    if (trimmed === 'Total:') {
      tierState = 'total';
      continue;
    }
    if (trimmed.startsWith('Cloud Tier unit-wise') || trimmed.startsWith('CT License')) {
      tierState = 'skip';
      continue;
    }
    // Filesys Compression subsection signals end of capacity block
    if (trimmed === 'Filesys Compression') break;

    if (tierState === 'skip' || tierState === 'total') continue;

    // ── Table separator row (multiple dash groups separated by spaces) ────
    if (/^-+(\s+-+)+\s*$/.test(trimmed)) {
      if (!tableOpen) {
        // Opening separator → read column bounds
        colBounds = getColBounds(raw);
        tableOpen = true;
      } else {
        // Closing separator → table done, reset for next block
        tableOpen = false;
      }
      continue;
    }

    // ── Skip header and annotation lines ──────────────────────────────────
    if (/^Resource\b/.test(trimmed)) continue;
    if (/^\*/.test(trimmed) || /^\s\*/.test(raw)) {
      // Cleaning date footnote: "* Estimated based on last cleaning of YYYY/MM/DD HH:MM:SS"
      const m = raw.match(/last cleaning (?:of|on)\s+([\d\/]+\s+[\d:]+)/i);
      if (m && !lastCleaningAt) {
        lastCleaningAt = parseCleaningDate(m[1], timeZone);
      }
      continue;
    }
    if (trimmed === '' || /^GENERATED:/.test(trimmed)) continue;
    // Skip column header continuation lines ("(GiB)", license notes, etc.)
    if (/^\(GiB\)/.test(trimmed) || /^\* Post-comp/.test(trimmed) ||
        /^\* Total CLOUDTIER/.test(trimmed)) continue;

    // ── Data rows: must start with '/' ────────────────────────────────────
    if (!trimmed.startsWith('/')) continue;
    if (colBounds.length < 5) {
      warnings.push(`Skipping capacity row "${trimmed}" — column bounds not yet resolved`);
      continue;
    }
    if (tierState === 'none') {
      // Implicit active tier (should not happen in practice given all OS versions
      // include "Active Tier:" but handle defensively)
      tierState = 'active';
    }

    const cols = extractColsExtended(raw, colBounds);
    // cols: [resource, sizeGib, usedGib, availGib, usePct, cleanableGib, ...]
    const resource = cols[0] ?? '';
    const usedGib = parseNum(cols[2] ?? '');
    if (usedGib === null) {
      warnings.push(`used_gib is NULL for resource "${resource}" (expected NOT NULL)`);
      continue;
    }

    snapshots.push({
      tier: tierState === 'cloud' ? 'cloud' : 'active',
      resource,
      sizeGib: parseNum(cols[1] ?? ''),
      usedGib,
      availGib: parseNum(cols[3] ?? ''),
      usePct: parsePct(cols[4] ?? ''),
      cleanableGib: parseNum(cols[5] ?? ''),
    });
  }

  return { data: snapshots, lastCleaningAt, warnings };
}
