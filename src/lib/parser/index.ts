/**
 * DD Monitor parser — public entry point.
 *
 * Pure TypeScript: input is the raw report string (part A text or part B JSON),
 * output is a ParseResult. Zero imports from Next.js, Supabase, or Node fs.
 * The API layer reads the file and passes the string; this module does no I/O.
 *
 * Architecture: ARCHITECTURE §6 / STANDARDS §6.
 */

export { assemble as parseReport } from './assemble';
export type {
  ParsedReport,
  ParsedPartB,
  ParseResult,
  ParsedCapacitySnapshot,
  ParsedCompressionStat,
  ParsedDeviceAlert,
  ParsedNetworkInterface,
  ParsedDiskSummary,
  ParsedMtree,
} from './types';
