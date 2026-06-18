/**
 * Splits a DD autosupport part A report into named sections and sub-sections.
 * Section delimiters: lines matching "==========  NAME  =========="
 * Sub-section delimiters: a title line followed immediately by a single unbroken
 * run of dashes (e.g. "-------------------"), which distinguishes them from
 * table separator rows that contain spaces between dash groups.
 */

/**
 * Normalize line endings and split the report into top-level sections.
 * Returns a Map of trimmed section name → lines (header and delimiter lines excluded).
 */
export function splitSections(raw: string): Map<string, string[]> {
  const normalized = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = normalized.split('\n');
  const sections = new Map<string, string[]>();
  let currentName: string | null = null;
  let currentLines: string[] = [];

  for (const line of lines) {
    // Section header: "==========  NAME  =========="
    const m = line.match(/^={10,}\s+(.+?)\s*={10,}\s*$/);
    if (m) {
      if (currentName !== null) {
        sections.set(currentName, currentLines);
      }
      currentName = m[1].trim();
      currentLines = [];
    } else if (currentName !== null) {
      currentLines.push(line);
    }
  }
  if (currentName !== null) {
    sections.set(currentName, currentLines);
  }
  return sections;
}

/**
 * Checks whether a line is a single-run-of-dashes sub-section separator
 * (all dashes, no spaces — as opposed to table separator rows like "---   ---   ---").
 */
function isSingleDashLine(line: string): boolean {
  return /^-+\s*$/.test(line);
}

/**
 * Checks whether a line looks like a sub-section title that would be followed
 * by a single-dash separator: non-empty, not indented, not starting with a dash or asterisk.
 */
function couldBeSubsectionTitle(line: string): boolean {
  if (line.trim().length === 0) return false;
  if (/^\s/.test(line)) return false; // indented
  if (/^[-*]/.test(line.trim())) return false;
  return true;
}

/**
 * Finds a named sub-section within a section's lines.
 * Looks for an exact match of `title` (trimmed) followed by a single-dash line.
 * Returns lines from after the separator until the next sub-section header or end.
 */
export function findSubsection(lines: string[], title: string): string[] {
  let startIdx = -1;
  for (let i = 0; i + 1 < lines.length; i++) {
    if (lines[i].trim() === title && isSingleDashLine(lines[i + 1])) {
      startIdx = i + 2;
      break;
    }
  }
  if (startIdx === -1) return [];

  const result: string[] = [];
  for (let i = startIdx; i < lines.length; i++) {
    // Stop at the start of the next sub-section
    if (
      i + 1 < lines.length &&
      couldBeSubsectionTitle(lines[i]) &&
      isSingleDashLine(lines[i + 1])
    ) {
      break;
    }
    result.push(lines[i]);
  }
  return result;
}
