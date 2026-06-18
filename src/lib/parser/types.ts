/**
 * Parser output types — mirror the DB schema column contract 1:1.
 * Nullable fields match the nullable columns in migration 0001.
 */

export interface ParsedCapacitySnapshot {
  tier: 'active' | 'cloud';
  resource: string;
  /** NULL when the report prints '-' (e.g. /data: pre-comp row). */
  sizeGib: number | null;
  usedGib: number;
  /** NULL when the report prints '-'. */
  availGib: number | null;
  /** NULL when the report prints '-'. */
  usePct: number | null;
  cleanableGib: number | null;
}

export interface ParsedCompressionStat {
  period: 'currently_used' | 'last_7_days' | 'last_24_hrs';
  precompGib: number;
  postcompGib: number;
  /** NULL for the Currently Used row (no global dedup factor). */
  globalCompFactor: number | null;
  /** NULL for the Currently Used row. */
  localCompFactor: number | null;
  totalCompFactor: number;
  reductionPct: number;
}

export interface ParsedDeviceAlert {
  alertId: string;
  severity: 'CRITICAL' | 'WARNING' | 'INFO' | 'NOTICE';
  class: string;
  object: string;
  message: string;
  postedAt: Date;
  isActive: boolean;
}

export interface ParsedNetworkInterface {
  port: string;
  state: 'running' | 'down' | 'fault';
  /** NULL when Link Status column reports 'unknown'. */
  linkUp: boolean | null;
  speed: string | null;
  duplex: string | null;
  hardwareAddress: string | null;
}

export interface ParsedDiskSummary {
  disksInUse: number;
  disksSpare: number;
  disksFailed: number;
  disksAbsent: number;
  reliabilityNotes: string[];
}

export interface ParsedMtree {
  mtreePath: string;
  precompGib: number;
  /** NULL when status column is absent (possible in older DD OS versions). */
  status: string | null;
}

export interface ParsedReport {
  hostname: string;
  generatedAt: Date;
  /** ISO date 'YYYY-MM-DD' computed in the device's own TIME_ZONE. */
  reportDate: string;
  timeZone: string;
  osVersion: string;
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
  memTotalMib: number | null;
  memFreeMib: number | null;
  swapTotalMib: number | null;
  swapFreeMib: number | null;
  systemAvailabilityPct: number | null;
  fsAvailabilityPct: number | null;
  lastCleaningAt: Date | null;
  capacitySnapshots: ParsedCapacitySnapshot[];
  compressionStats: ParsedCompressionStat[];
  deviceAlerts: ParsedDeviceAlert[];
  networkInterfaces: ParsedNetworkInterface[];
  disks: ParsedDiskSummary | null;
  mtrees: ParsedMtree[];
  warnings: string[];
}

/** Minimal object extracted from a DD OS 7.13 part B JSON companion file. */
export interface ParsedPartB {
  hostname: string;
  generatedAt: Date;
  timeZone: string;
  rawJson: Record<string, unknown>;
}

export type ParseResult =
  | { ok: true; type: 'part_a'; data: ParsedReport; warnings: string[] }
  | { ok: true; type: 'part_b'; data: ParsedPartB; warnings: string[] }
  | { ok: false; error: string; warnings: string[] };
