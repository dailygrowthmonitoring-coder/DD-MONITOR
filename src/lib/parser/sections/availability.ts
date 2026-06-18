import { parsePct } from '../helpers';

/** Extract availability percentages from System Availability Metric sub-section lines. */
export function extract(lines: string[]): {
  data: { systemAvailabilityPct: number | null; fsAvailabilityPct: number | null } | null;
  warnings: string[];
} {
  const warnings: string[] = [];
  let systemPct: number | null = null;
  let fsPct: number | null = null;

  for (const line of lines) {
    // "System availability                                     99.489%"
    // "System availability excluding controlled downtime       99.489%"
    // "Filesystem availability                                 99.446%"
    // We want the first "System availability" (not the "excluding" variant)
    // and the first "Filesystem availability".
    if (/^System availability\s+[\d.]+%/.test(line.trim()) && systemPct === null) {
      const m = line.match(/([\d.]+)%\s*$/);
      if (m) systemPct = parsePct(m[1] + '%');
    }
    if (/^Filesystem availability\s+[\d.]+%/.test(line.trim()) && fsPct === null) {
      const m = line.match(/([\d.]+)%\s*$/);
      if (m) fsPct = parsePct(m[1] + '%');
    }
  }

  if (systemPct === null && fsPct === null && lines.length > 0) {
    warnings.push('Could not parse system or filesystem availability percentages');
  }

  return {
    data: { systemAvailabilityPct: systemPct, fsAvailabilityPct: fsPct },
    warnings,
  };
}
