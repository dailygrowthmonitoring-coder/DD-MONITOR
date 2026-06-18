import { getColBounds, extractColsExtended, parseNum, parseFactor, parseTotalFactor, parseCleaningDate } from '../helpers';
import type { ParsedCompressionStat } from '../types';

type Period = 'currently_used' | 'last_7_days' | 'last_24_hrs';

/**
 * Extract compression_stats rows from the Filesys Compression sub-section lines
 * (passed in after "Filesys Compression / ---" has been stripped by findSubsection).
 *
 * Handles both 6.2/7.7 style (no tier labels) and 7.13 style (Active Tier: / Cloud Tier:).
 * Only the Active Tier block (or the sole block in 6.2/7.7) is stored; the Cloud Tier
 * compression block is skipped and noted as a warning.
 */
export function extract(
  lines: string[],
  timeZone: string,
): {
  data: ParsedCompressionStat[];
  lastCleaningAt: Date | null;
  warnings: string[];
} {
  const warnings: string[] = [];
  let lastCleaningAt: Date | null = null;

  // ── Determine whether to use the "Active Tier:" block or all lines ──────
  const hasActiveTierLabel = lines.some(l => l.trim() === 'Active Tier:');
  let workLines: string[];

  if (hasActiveTierLabel) {
    // 7.13 style: extract from "Active Tier:" until "Cloud Tier:" or combined block
    const startIdx = lines.findIndex(l => l.trim() === 'Active Tier:');
    const cloudIdx = lines.findIndex((l, i) => i > startIdx && l.trim() === 'Cloud Tier:');
    // Also stop at the combined "Currently Used:*" section which begins with that label
    // at column 0 without any indentation after the Cloud Tier block
    const endIdx = cloudIdx !== -1 ? cloudIdx : lines.length;
    workLines = lines.slice(startIdx + 1, endIdx);
    if (cloudIdx !== -1) {
      warnings.push('Cloud Tier compression block present but not stored (schema stores Active Tier only)');
    }
  } else {
    workLines = lines;
  }

  // ── Find the dashes row to establish column bounds ───────────────────────
  let colBounds = getColBounds('');
  for (const line of workLines) {
    if (/^-+(\s+-+)+\s*$/.test(line.trim())) {
      colBounds = getColBounds(line);
      break;
    }
  }

  // ── Parse the three period rows ──────────────────────────────────────────
  const stats: ParsedCompressionStat[] = [];

  for (const line of workLines) {
    const trimmed = line.trim();

    // Extract last_cleaning_at from footnote
    const cleanMatch = line.match(/last cleaning (?:of|on)\s+([\d\/]+\s+[\d:]+)/i);
    if (cleanMatch && !lastCleaningAt) {
      lastCleaningAt = parseCleaningDate(cleanMatch[1], timeZone);
    }

    // Detect period by row label
    let period: Period | null = null;
    if (/^Currently Used/.test(trimmed)) {
      period = 'currently_used';
    } else if (/^\s{1,4}Last 7/.test(line)) {
      period = 'last_7_days';
    } else if (/^\s{1,4}Last 24/.test(line)) {
      period = 'last_24_hrs';
    }
    if (!period) continue;
    if (colBounds.length < 5) {
      warnings.push(`Skipping compression row "${period}" — column bounds not resolved`);
      continue;
    }

    // cols: [label, precomp, postcomp, globalFactor, localFactor, totalFactor+reduction]
    const cols = extractColsExtended(line, colBounds);
    const precompGib = parseNum(cols[1] ?? '');
    const postcompGib = parseNum(cols[2] ?? '');

    // Last 7 / Last 24 rows may be entirely empty in Cloud Tier — skip with warning
    if (precompGib === null || postcompGib === null) {
      warnings.push(`Skipping compression row "${period}" — precomp_gib or postcomp_gib is NULL (empty row)`);
      continue;
    }

    const totalRaw = parseTotalFactor(cols[5] ?? '');
    if (!totalRaw) {
      warnings.push(`Could not parse total_comp_factor for period "${period}": "${cols[5]}"`);
      continue;
    }

    stats.push({
      period,
      precompGib,
      postcompGib,
      globalCompFactor: parseFactor(cols[3] ?? ''),
      localCompFactor: parseFactor(cols[4] ?? ''),
      totalCompFactor: totalRaw.factor,
      reductionPct: totalRaw.reduction,
    });
  }

  // Deduplicate by period (take first occurrence = Active Tier)
  const seen = new Set<Period>();
  const deduped: ParsedCompressionStat[] = [];
  for (const s of stats) {
    if (!seen.has(s.period)) {
      seen.add(s.period);
      deduped.push(s);
    }
  }

  return { data: deduped, lastCleaningAt, warnings };
}
