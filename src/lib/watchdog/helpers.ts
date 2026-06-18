/**
 * Pure, stateless helpers for the watchdog cron.
 * Baghdad (Asia/Baghdad) is UTC+3 with no DST — offset is stable year-round.
 */

export const BAGHDAD_OFFSET_HOURS = 3;

/**
 * Returns today's date string in Asia/Baghdad timezone as 'YYYY-MM-DD'.
 * Pure relative to Date.now(); extracted so callers can inject a fixed `nowMs`
 * for deterministic tests.
 */
export function todayBaghdad(nowMs: number = Date.now()): string {
  const baghdadMs = nowMs + BAGHDAD_OFFSET_HOURS * 3_600_000;
  return new Date(baghdadMs).toISOString().slice(0, 10);
}

/**
 * Returns the UTC ISO string for midnight (00:00:00) Baghdad time on the
 * given date string.  Used as the lower bound of the deduplication window.
 *
 * Example: '2026-06-16' → '2026-06-15T21:00:00.000Z'
 */
export function baghdadMidnightUtc(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00+03:00`).toISOString();
}

/**
 * Extracts the device-group hint from an autosupport email subject line.
 * Returns null when none of the known patterns match.
 */
export function subjectGroupHint(subject: string): 'BAG' | 'OFFSET' | 'AVAMAR' | null {
  const s = subject.toLowerCase();
  if (s.includes('autosupport-bag'))    return 'BAG';
  if (s.includes('autosupport-offset')) return 'OFFSET';
  if (s.includes('autosupport-avamar')) return 'AVAMAR';
  return null;
}
