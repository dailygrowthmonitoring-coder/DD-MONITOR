import { getColBounds, extractColsExtended } from '../helpers';
import type { ParsedNetworkInterface } from '../types';

/**
 * State normalisation rule:
 *   Link Status="no" or "unknown" (any State) → 'fault'  (present but no link)
 *   State="running" + Link Status="yes"        → 'running'
 *   Anything else                              → 'down'   (administratively down)
 */
function normaliseState(
  stateCol: string,
  linkStatusCol: string,
): 'running' | 'down' | 'fault' {
  const st = stateCol.trim().toLowerCase();
  const ls = linkStatusCol.trim().toLowerCase();
  if (ls === 'no' || ls === 'unknown') return 'fault';
  if (st === 'running') return 'running';
  return 'down';
}

function normaliseLinkUp(linkStatus: string): boolean | null {
  const ls = linkStatus.trim().toLowerCase();
  if (ls === 'yes') return true;
  if (ls === 'no') return false;
  return null; // 'unknown' or anything else
}

/** Extract network_interfaces rows from Net Show Hardware sub-section lines. */
export function extract(lines: string[]): {
  data: ParsedNetworkInterface[];
  warnings: string[];
} {
  const warnings: string[] = [];
  const interfaces: ParsedNetworkInterface[] = [];

  let colBounds = getColBounds('');
  let headerFound = false;

  // Column index mapping (consistent across 6.2 / 7.7 / 7.13):
  // 0=Port, 1=Speed, 2=Duplex, 3=SuppSpeeds(skip), 4=HardwareAddr, 5=Physical(skip),
  // 6=LinkStatus, 7=State, 8=Autoneg(optional, skip)
  const COL = {
    PORT: 0,
    SPEED: 1,
    DUPLEX: 2,
    HARDWARE: 4,
    LINK_STATUS: 6,
    STATE: 7,
  } as const;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === '') continue;

    // Header line — scan to confirm column layout
    if (/^\bPort\b/.test(trimmed) && /Link Status/.test(trimmed)) {
      // Optionally detect non-standard column order here in the future
      continue;
    }

    // Dashes row
    if (/^-+(\s+-+)+\s*$/.test(trimmed)) {
      if (!headerFound) {
        colBounds = getColBounds(line);
        headerFound = true;
      } else {
        break; // closing dashes = end of table
      }
      continue;
    }

    if (!headerFound || colBounds.length < 8) continue;

    const cols = extractColsExtended(line, colBounds);
    const port = cols[COL.PORT]?.trim() ?? '';
    if (!port || /^-+/.test(port)) continue; // skip separator-looking rows

    interfaces.push({
      port,
      speed: cols[COL.SPEED]?.trim() || null,
      duplex: cols[COL.DUPLEX]?.trim() || null,
      hardwareAddress: cols[COL.HARDWARE]?.trim() || null,
      linkUp: normaliseLinkUp(cols[COL.LINK_STATUS] ?? ''),
      state: normaliseState(cols[COL.STATE] ?? '', cols[COL.LINK_STATUS] ?? ''),
    });
  }

  return { data: interfaces, warnings };
}
