/** Shared parsing utilities for DD autosupport report fields. */

export interface ColBounds {
  start: number;
  end: number;
}

/**
 * Given a dashes separator line (e.g. "--------   ---------   ----"),
 * returns the start/end char positions of each dash group.
 */
export function getColBounds(dashLine: string): ColBounds[] {
  const cols: ColBounds[] = [];
  const re = /-+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(dashLine)) !== null) {
    cols.push({ start: m.index, end: m.index + m[0].length });
  }
  return cols;
}

/**
 * Extract column values from a data line using column bounds.
 * Each column is extracted exactly within its dash-group bounds and trimmed.
 */
export function extractCols(line: string, cols: ColBounds[]): string[] {
  return cols.map(({ start, end }) => line.substring(start, end).trim());
}

/**
 * Like extractCols but each column extends to the next column's start position.
 * Use for tables where a cell value may be wider than the visible dash group.
 */
export function extractColsExtended(line: string, cols: ColBounds[]): string[] {
  return cols.map(({ start }, i) => {
    const end = i + 1 < cols.length ? cols[i + 1].start : line.length;
    return line.substring(start, end).trim();
  });
}

/**
 * Parse a numeric string, returning null for '-' or empty values.
 * Strips trailing '*' and internal commas.
 */
export function parseNum(s: string): number | null {
  const t = s.trim().replace(/\*$/, '').replace(/,/g, '');
  if (t === '-' || t === '') return null;
  const n = parseFloat(t);
  return isNaN(n) ? null : n;
}

/**
 * Parse a percentage string ("64%" → 64), returning null for '-' or empty.
 */
export function parsePct(s: string): number | null {
  const t = s.trim().replace(/\*$/, '').replace('%', '');
  if (t === '-' || t === '') return null;
  const n = parseFloat(t);
  return isNaN(n) ? null : n;
}

/**
 * Parse a compression factor string ("53.2x" → 53.2), returning null for '-'.
 */
export function parseFactor(s: string): number | null {
  const t = s.trim();
  if (t === '-' || t === '') return null;
  const n = parseFloat(t.replace(/x$/i, ''));
  return isNaN(n) ? null : n;
}

/**
 * Parse a total-compression cell "128.5x (99.2)" → { factor: 128.5, reduction: 99.2 }.
 * Returns null for '-' or unparseable content.
 */
export function parseTotalFactor(s: string): { factor: number; reduction: number } | null {
  const t = s.trim();
  if (t === '-' || t === '') return null;
  const m = t.match(/^([\d.]+)x\s*\(([\d.]+)\)/);
  if (!m) return null;
  const factor = parseFloat(m[1]);
  const reduction = parseFloat(m[2]);
  if (isNaN(factor) || isNaN(reduction)) return null;
  return { factor, reduction };
}

/**
 * Returns the UTC offset in milliseconds for an IANA timezone at a given instant.
 * Positive = local is ahead of UTC (e.g. Asia/Baghdad +3 → +10_800_000).
 */
function getOffsetMs(timeZone: string, date: Date): number {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const parts: Record<string, string> = {};
  for (const p of fmt.formatToParts(date)) {
    parts[p.type] = p.value;
  }
  // hour12:false with Intl may yield "24" for midnight; normalize
  const h = parseInt(parts['hour'] ?? '0') % 24;
  const localAsUtcMs = Date.UTC(
    parseInt(parts['year'] ?? '1970'),
    parseInt(parts['month'] ?? '1') - 1,
    parseInt(parts['day'] ?? '1'),
    h,
    parseInt(parts['minute'] ?? '0'),
    parseInt(parts['second'] ?? '0'),
  );
  return localAsUtcMs - date.getTime();
}

const MONTH_MAP: Record<string, number> = {
  Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6,
  Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12,
};

/**
 * Parse a device-local timestamp ("Tue Nov 11 06:05:29 2025") to a UTC Date,
 * using the device's IANA timezone to correctly account for the offset.
 */
export function parseDeviceLocalTime(dateStr: string, timeZone: string): Date | null {
  const m = dateStr
    .trim()
    .match(/\w{3}\s+(\w{3})\s+(\d{1,2})\s+(\d{2}):(\d{2}):(\d{2})\s+(\d{4})/);
  if (!m) return null;
  const [, mon, dayStr, h, min, sec, yr] = m;
  const mo = MONTH_MAP[mon];
  if (!mo) return null;

  // Treat local components as UTC to get an approximate epoch
  const approxMs = Date.UTC(
    parseInt(yr),
    mo - 1,
    parseInt(dayStr),
    parseInt(h),
    parseInt(min),
    parseInt(sec),
  );
  const approxUtc = new Date(approxMs);
  const offsetMs = getOffsetMs(timeZone, approxUtc);
  return new Date(approxMs - offsetMs);
}

/**
 * Parse a "YYYY/MM/DD HH:MM:SS" device-local cleaning timestamp to a UTC Date.
 */
export function parseCleaningDate(s: string, timeZone: string): Date | null {
  const m = s.trim().match(/^(\d{4})\/(\d{2})\/(\d{2})\s+(\d{2}):(\d{2}):(\d{2})/);
  if (!m) return null;
  const [, yr, mo, day, h, min, sec] = m;
  const approxMs = Date.UTC(
    parseInt(yr),
    parseInt(mo) - 1,
    parseInt(day),
    parseInt(h),
    parseInt(min),
    parseInt(sec),
  );
  const approxUtc = new Date(approxMs);
  const offsetMs = getOffsetMs(timeZone, approxUtc);
  return new Date(approxMs - offsetMs);
}
