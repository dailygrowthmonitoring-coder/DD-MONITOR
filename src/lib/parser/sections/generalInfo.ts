import { parseCleaningDate } from '../helpers';

export interface GeneralInfoData {
  hostname: string;
  generatedAt: Date;
  reportDate: string; // 'YYYY-MM-DD' in device timezone
  timeZone: string;
  osVersion: string;
  epochTime: number;
  serialNo: string | null;
  chassisSerial: string | null;
  modelNo: string | null;
  displayName: string | null;
  adminEmail: string | null;
  location: string | null;
  uptimeDays: number | null;
  loadAvg1m: number | null;
  loadAvg5m: number | null;
  loadAvg15m: number | null;
  lastCleaningAt: Date | null;
}

/** Extract device identity and timing fields from GENERAL INFO section lines. */
export function extract(
  lines: string[],
): { data: GeneralInfoData | null; warnings: string[] } {
  const warnings: string[] = [];
  const kv: Record<string, string> = {};

  for (const line of lines) {
    const eq = line.indexOf('=');
    if (eq > 0) {
      const key = line.substring(0, eq).trim().toUpperCase();
      const val = line.substring(eq + 1).trim();
      kv[key] = val;
    }
    // Stop at the first subsection header (non-kv line that looks like a title)
    if (line.trim() === '' && Object.keys(kv).length > 5) break;
  }

  const hostname = kv['HOSTNAME'] ?? '';
  if (!hostname) {
    return { data: null, warnings: ['HARD_FAIL: HOSTNAME not found in GENERAL INFO'] };
  }

  const epochStr = kv['GENERATED_EPOCH_TIME'];
  if (!epochStr) {
    return { data: null, warnings: ['HARD_FAIL: GENERATED_EPOCH_TIME not found in GENERAL INFO'] };
  }
  const epochSec = parseInt(epochStr, 10);
  if (isNaN(epochSec)) {
    return { data: null, warnings: [`HARD_FAIL: GENERATED_EPOCH_TIME unparseable: ${epochStr}`] };
  }

  const timeZone = kv['TIME_ZONE'] ?? 'UTC';
  if (!kv['TIME_ZONE']) {
    warnings.push('TIME_ZONE missing from GENERAL INFO; defaulting to UTC');
  }

  const generatedAt = new Date(epochSec * 1000);

  // Compute report_date in the device's own timezone using the exact epoch
  const reportDate = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(generatedAt);

  const osVersion = kv['VERSION'] ?? '';
  if (!osVersion) warnings.push('VERSION not found in GENERAL INFO');

  // Parse UPTIME for uptimeDays and load averages
  // Format: " 06:02:16 up 344 days, 17:59,  0 users,  load average: 4.22, 3.85, 3.86"
  // Or without days: " up 3:12,  0 users, load average: 1.0, 2.0, 3.0"
  const uptimeStr = kv['UPTIME'] ?? '';
  let uptimeDays: number | null = null;
  let loadAvg1m: number | null = null;
  let loadAvg5m: number | null = null;
  let loadAvg15m: number | null = null;

  const daysMatch = uptimeStr.match(/\bup\s+(\d+)\s+days?/);
  if (daysMatch) {
    uptimeDays = parseInt(daysMatch[1], 10);
  } else if (/\bup\s+\d+:\d+/.test(uptimeStr)) {
    uptimeDays = 0; // Less than one day
  } else if (uptimeStr) {
    warnings.push(`Could not parse uptime days from UPTIME: ${uptimeStr.trim()}`);
  }

  const loadMatch = uptimeStr.match(/load average:\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)/);
  if (loadMatch) {
    loadAvg1m = parseFloat(loadMatch[1]);
    loadAvg5m = parseFloat(loadMatch[2]);
    loadAvg15m = parseFloat(loadMatch[3]);
  } else if (uptimeStr) {
    warnings.push('Could not parse load averages from UPTIME line');
  }

  // Derive display_name from hostname (first dot-segment)
  const displayName = hostname.split('.')[0] ?? null;

  // last_cleaning_at sometimes appears in GENERAL INFO (rare), parse if present
  let lastCleaningAt: Date | null = null;
  for (const line of lines) {
    const m = line.match(/last cleaning (?:of|on)\s+([\d\/]+\s+[\d:]+)/i);
    if (m) {
      lastCleaningAt = parseCleaningDate(m[1], timeZone);
      break;
    }
  }

  return {
    data: {
      hostname,
      generatedAt,
      reportDate,
      timeZone,
      osVersion,
      epochTime: epochSec,
      serialNo: kv['SYSTEM_SERIALNO'] ?? null,
      chassisSerial: kv['CHASSIS_SERIALNO'] ?? null,
      modelNo: kv['MODEL_NO'] ?? null,
      displayName,
      adminEmail: kv['ADMIN_EMAIL'] ?? null,
      location: kv['LOCATION'] ?? null,
      uptimeDays,
      loadAvg1m,
      loadAvg5m,
      loadAvg15m,
      lastCleaningAt,
    },
    warnings,
  };
}
