/**
 * Extract memory and swap metrics from System Memory Summary sub-section lines.
 *
 * DD OS 6.2 uses "Free memory:" whereas DD OS 7.x uses "Available memory:".
 * Both map to mem_free_mib (the amount of memory available to applications).
 */
export function extract(lines: string[]): {
  data: {
    memTotalMib: number | null;
    memFreeMib: number | null;
    swapTotalMib: number | null;
    swapFreeMib: number | null;
  } | null;
  warnings: string[];
} {
  const warnings: string[] = [];

  function parseMib(line: string): number | null {
    const m = line.match(/([\d]+)\s+MiB/);
    return m ? parseInt(m[1], 10) : null;
  }

  let memTotalMib: number | null = null;
  let memFreeMib: number | null = null;
  let swapTotalMib: number | null = null;
  let swapFreeMib: number | null = null;

  for (const line of lines) {
    const t = line.trim();
    if (/^Total memory:/i.test(t)) {
      memTotalMib = parseMib(t);
    } else if (/^Free memory:/i.test(t)) {
      // 6.2 label
      memFreeMib = parseMib(t);
    } else if (/^Available memory:/i.test(t)) {
      // 7.x label
      memFreeMib = parseMib(t);
    } else if (/^Total swap:/i.test(t)) {
      swapTotalMib = parseMib(t);
    } else if (/^Free swap:/i.test(t)) {
      swapFreeMib = parseMib(t);
    }
  }

  if (memTotalMib === null && memFreeMib === null && lines.length > 0) {
    warnings.push('Could not parse memory metrics from System Memory Summary');
  }

  return {
    data: { memTotalMib, memFreeMib, swapTotalMib, swapFreeMib },
    warnings,
  };
}
