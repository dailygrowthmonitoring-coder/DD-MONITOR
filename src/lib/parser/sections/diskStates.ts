import { getColBounds, extractColsExtended } from '../helpers';
import type { ParsedDiskSummary } from '../types';

/**
 * Parse an integer from a cell, treating '-' or empty as 0.
 * Sum-across-tiers logic: a '-' means 0 disks of that type in that tier.
 */
function parseDiskCount(s: string): number {
  const t = s.trim();
  if (t === '-' || t === '') return 0;
  const n = parseInt(t, 10);
  return isNaN(n) ? 0 : n;
}

/**
 * Extract disk_summary row from Disk Status sub-section lines.
 * Disk States columns vary by OS version:
 *   6.2:  Active tier | Cache tier
 *   7.7:  Active tier | Head unit | Cache tier
 *   7.13: Active tier | Head unit | Other | Cache tier | Cloud tier
 * Counts are summed across all tier columns for each disk state row.
 */
export function extract(lines: string[]): {
  data: ParsedDiskSummary | null;
  warnings: string[];
} {
  const warnings: string[] = [];

  let colBounds = getColBounds('');
  let headerFound = false;
  const reliabilityNotes: string[] = [];
  let disksInUse = 0;
  let disksSpare = 0;
  let disksFailed = 0;
  let disksAbsent = 0;
  let foundStateTable = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === '') continue;

    // Status line (e.g. "Normal - Storage operational", "Warning - Disk failure(s)")
    if (/^(Normal|Warning|Critical)\s*-/i.test(trimmed)) {
      reliabilityNotes.push(trimmed);
      continue;
    }

    // Header line for the Disk States table
    if (/^Disk States\s+\w/.test(trimmed)) {
      continue;
    }

    // Dashes row for the Disk States table
    if (/^-+(\s+-+)+\s*$/.test(trimmed)) {
      if (!headerFound) {
        colBounds = getColBounds(line);
        headerFound = true;
        foundStateTable = true;
      } else {
        break; // closing dashes
      }
      continue;
    }

    if (!headerFound || colBounds.length < 2) continue;

    const cols = extractColsExtended(line, colBounds);
    const label = cols[0]?.trim().toLowerCase() ?? '';

    // Sum all tier columns (index 1 onward), skip "TOTAL DISKS"
    if (label === 'total disks') continue;

    const sum = cols
      .slice(1)
      .reduce((acc, c) => acc + parseDiskCount(c), 0);

    if (/^in use/.test(label)) disksInUse = sum;
    else if (/^spare/.test(label)) disksSpare = sum;
    else if (/^failed/.test(label)) disksFailed = sum;
    else if (/^absent/.test(label)) disksAbsent = sum;
  }

  if (!foundStateTable) {
    warnings.push('Disk States table not found in Disk Status sub-section');
    return { data: null, warnings };
  }

  return {
    data: { disksInUse, disksSpare, disksFailed, disksAbsent, reliabilityNotes },
    warnings,
  };
}
