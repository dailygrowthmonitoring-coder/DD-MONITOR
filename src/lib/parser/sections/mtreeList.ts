import { getColBounds, extractColsExtended, parseNum } from '../helpers';
import type { ParsedMtree } from '../types';

/**
 * Extract mtree rows from Mtree List sub-section lines.
 * Table format: Name | Pre-Comp (GiB) | Status
 * Status column may be absent in some DD OS versions → null per migration.
 */
export function extract(lines: string[]): {
  data: ParsedMtree[];
  warnings: string[];
} {
  const warnings: string[] = [];
  const mtrees: ParsedMtree[] = [];

  let colBounds = getColBounds('');
  let headerFound = false;
  let hasStatusCol = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === '') continue;

    // Header line: "Name   Pre-Comp (GiB)   Status"
    if (/^Name\s+Pre-Comp/.test(trimmed)) {
      hasStatusCol = /Status/.test(trimmed);
      continue;
    }

    // Dashes row
    if (/^-+(\s+-+)+\s*$/.test(trimmed) || /^-+\s*$/.test(trimmed)) {
      if (!headerFound) {
        colBounds = getColBounds(line);
        headerFound = true;
      } else {
        break; // closing dashes = end of table
      }
      continue;
    }

    // Legend lines (e.g. " D    : Deleted")
    if (/^\s+[A-Z]+\s*:/.test(line)) break;

    if (!headerFound || colBounds.length < 2) continue;

    // Data rows start with '/'
    if (!trimmed.startsWith('/')) continue;

    const cols = extractColsExtended(line, colBounds);
    const mtreePath = cols[0]?.trim() ?? '';
    const precompGib = parseNum(cols[1] ?? '');

    if (!mtreePath) continue;
    if (precompGib === null) {
      warnings.push(`Could not parse precomp_gib for mtree "${mtreePath}"`);
      continue;
    }

    const status = hasStatusCol ? (cols[2]?.trim() || null) : null;

    mtrees.push({ mtreePath, precompGib, status });
  }

  return { data: mtrees, warnings };
}
