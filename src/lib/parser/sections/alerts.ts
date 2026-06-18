import { getColBounds, extractColsExtended, parseDeviceLocalTime } from '../helpers';
import type { ParsedDeviceAlert } from '../types';

type Severity = 'CRITICAL' | 'WARNING' | 'INFO' | 'NOTICE';

/**
 * Normalise a severity string from the appliance to the DB-allowed set.
 * The DD OS 6.2 appliance occasionally reports "ERROR" which is mapped to CRITICAL
 * since both indicate a fault requiring immediate attention.
 */
function normaliseSeverity(raw: string, warnings: string[]): Severity | null {
  const upper = raw.trim().toUpperCase();
  if (upper === 'CRITICAL') return 'CRITICAL';
  if (upper === 'WARNING' || upper === 'WARN') return 'WARNING';
  if (upper === 'ERROR') {
    warnings.push(`Alert severity "ERROR" normalised to CRITICAL (not in DB enum)`);
    return 'CRITICAL';
  }
  if (upper === 'INFO') return 'INFO';
  if (upper === 'NOTICE') return 'NOTICE';
  warnings.push(`Unknown alert severity "${raw}" — row skipped`);
  return null;
}

/**
 * Parse a single alert table block (Current Alerts or Alerts History).
 * Returns the parsed rows along with the hasExtraClearTimeCol flag for History.
 */
function parseAlertTable(
  lines: string[],
  isActive: boolean,
  timeZone: string,
  warnings: string[],
): ParsedDeviceAlert[] {
  const alerts: ParsedDeviceAlert[] = [];

  // Find the dashes row to determine column positions
  let colBounds = getColBounds('');
  let headerFound = false;

  for (const line of lines) {
    const trimmed = line.trim();

    // Empty-case messages
    if (/^No active alerts/i.test(trimmed) || /^No historic alerts/i.test(trimmed) ||
        /^No recent alerts/i.test(trimmed)) {
      return [];
    }
    if (/^There (is|are) \d+ active alert/.test(trimmed)) continue;
    if (trimmed === '') continue;

    // Dashes row → capture column bounds (single occurrence before data rows)
    if (/^-+(\s+-+)+\s*$/.test(trimmed)) {
      if (!headerFound) {
        colBounds = getColBounds(line);
        headerFound = true;
      }
      // Second dashes row = end of table
      else break;
      continue;
    }

    // Header row (contains "Id" and "Post Time")
    if (/\bId\b/.test(trimmed) && /Post Time/.test(trimmed)) continue;

    // Data rows need column bounds
    if (!headerFound || colBounds.length < 5) continue;

    // Determine if this is History format (7 columns) or Current (6 columns)
    // History adds "Clear Time" between Post Time and Severity
    const numCols = colBounds.length;
    const hasHistoryCols = !isActive && numCols >= 7;

    const cols = extractColsExtended(line, colBounds);

    const alertId   = cols[0]?.trim() ?? '';
    const postTime  = cols[1]?.trim() ?? '';
    // History: col[2] = clearTime (skip), col[3] = severity, col[4] = class, col[5] = object, col[6] = message
    // Current: col[2] = severity, col[3] = class, col[4] = object, col[5] = message
    const sevIdx    = hasHistoryCols ? 3 : 2;
    const classIdx  = hasHistoryCols ? 4 : 3;
    const objectIdx = hasHistoryCols ? 5 : 4;
    const msgIdx    = hasHistoryCols ? 6 : 5;

    if (!alertId || !/^[a-zA-Z0-9_-]+$/.test(alertId)) continue; // skip non-data rows

    const severity = normaliseSeverity(cols[sevIdx] ?? '', warnings);
    if (!severity) continue;

    const postedAt = parseDeviceLocalTime(postTime, timeZone);
    if (!postedAt) {
      warnings.push(`Could not parse alert timestamp "${postTime}" for alert ${alertId}`);
      continue;
    }

    alerts.push({
      alertId,
      severity,
      class: cols[classIdx]?.trim() ?? '',
      object: cols[objectIdx]?.trim() ?? '',
      message: cols[msgIdx]?.trim() ?? '',
      postedAt,
      isActive,
    });
  }

  return alerts;
}

/**
 * Extract device_alerts from Current Alerts and Alerts History sub-section lines.
 * If the same alertId appears in both, the Current (is_active=true) row takes precedence.
 */
export function extract(
  currentLines: string[],
  historyLines: string[],
  timeZone: string,
): { data: ParsedDeviceAlert[]; warnings: string[] } {
  const warnings: string[] = [];

  const current = parseAlertTable(currentLines, true, timeZone, warnings);
  const history = parseAlertTable(historyLines, false, timeZone, warnings);

  // Merge, keeping Current Alerts when the same alertId appears in both
  const byId = new Map<string, ParsedDeviceAlert>();
  for (const a of history) byId.set(a.alertId, a);
  for (const a of current) byId.set(a.alertId, a); // overwrites history entry

  return { data: Array.from(byId.values()), warnings };
}
