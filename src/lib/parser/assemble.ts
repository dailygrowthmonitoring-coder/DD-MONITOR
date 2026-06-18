/**
 * Assembles a ParsedReport from raw part A text by coordinating all section extractors.
 * Hard-fail requirements (STANDARDS §6):
 *   1. hostname must be present in GENERAL INFO
 *   2. generated_at (epoch) must be present and parseable
 *   3. At least one active-tier /data: post-comp capacity row must be present
 */

import { splitSections, findSubsection } from './split';
import { extract as extractGeneralInfo } from './sections/generalInfo';
import { extract as extractServerUsage } from './sections/serverUsage';
import { extract as extractCompression } from './sections/filesysCompression';
import { extract as extractAvailability } from './sections/availability';
import { extract as extractMemory } from './sections/systemMemory';
import { extract as extractAlerts } from './sections/alerts';
import { extract as extractNet } from './sections/netHardware';
import { extract as extractDisk } from './sections/diskStates';
import { extract as extractMtrees } from './sections/mtreeList';
import type { ParsedReport, ParseResult, ParsedPartB } from './types';

/** Detect and parse a DD OS 7.13+ part B JSON companion file. */
function assemblePartB(raw: string): ParseResult {
  let json: Record<string, unknown>;
  try {
    json = JSON.parse(raw) as Record<string, unknown>;
  } catch (e) {
    return { ok: false, error: `Part B JSON parse failed: ${String(e)}`, warnings: [] };
  }

  const gi = json['general_info'] as Record<string, unknown> | undefined;
  if (!gi) {
    return { ok: false, error: 'Part B JSON missing general_info block', warnings: [] };
  }

  const hostname = (gi['hostname'] as string | undefined)?.trim() ?? '';
  if (!hostname) {
    return { ok: false, error: 'Part B JSON: hostname missing in general_info', warnings: [] };
  }

  const epochStr = gi['generated_epoch_time'] as string | number | undefined;
  const epoch = typeof epochStr === 'number' ? epochStr : parseInt(String(epochStr ?? ''), 10);
  if (isNaN(epoch)) {
    return {
      ok: false,
      error: `Part B JSON: generated_epoch_time unparseable: ${epochStr}`,
      warnings: [],
    };
  }

  const timeZone = (gi['time_zone'] as string | undefined)?.trim() ?? 'UTC';
  const result: ParsedPartB = {
    hostname,
    generatedAt: new Date(epoch * 1000),
    timeZone,
    rawJson: json,
  };
  return { ok: true, type: 'part_b', data: result, warnings: [] };
}

/** Parse a part A autosupport text report into a structured ParsedReport. */
function assemblePartA(raw: string): ParseResult {
  const warnings: string[] = [];
  const sections = splitSections(raw);

  // ── GENERAL INFO ─────────────────────────────────────────────────────────
  const giLines = sections.get('GENERAL INFO') ?? [];
  const gi = extractGeneralInfo(giLines);
  warnings.push(...gi.warnings);
  if (!gi.data) {
    return { ok: false, error: gi.warnings.join('; '), warnings };
  }
  const { timeZone } = gi.data;

  // ── SERVER USAGE ──────────────────────────────────────────────────────────
  const serverUsageLines = sections.get('SERVER USAGE') ?? [];
  if (serverUsageLines.length === 0) {
    warnings.push('SERVER USAGE section not found');
  }
  const usage = extractServerUsage(serverUsageLines, timeZone);
  warnings.push(...usage.warnings);

  // Hard-fail: /data: post-comp active tier row must exist
  const postCompRow = usage.data.find(
    s => s.resource === '/data: post-comp' && s.tier === 'active',
  );
  if (!postCompRow) {
    return {
      ok: false,
      error: 'HARD_FAIL: /data: post-comp active tier row missing from SERVER USAGE',
      warnings,
    };
  }

  // ── FILESYS COMPRESSION ───────────────────────────────────────────────────
  const compressionSubLines = findSubsection(serverUsageLines, 'Filesys Compression');
  const comp = extractCompression(compressionSubLines, timeZone);
  warnings.push(...comp.warnings);
  if (comp.data.length === 0) {
    warnings.push('No compression stats rows parsed (expected 3 periods)');
  }

  // last_cleaning_at: prefer SERVER USAGE footnote, fall back to compression footnote
  const lastCleaningAt =
    usage.lastCleaningAt ?? comp.lastCleaningAt ?? gi.data.lastCleaningAt ?? null;

  // ── GENERAL STATUS ────────────────────────────────────────────────────────
  const gsLines = sections.get('GENERAL STATUS') ?? [];
  if (gsLines.length === 0) {
    warnings.push('GENERAL STATUS section not found');
  }

  const availLines = findSubsection(gsLines, 'System Availability Metric');
  const avail = extractAvailability(availLines);
  warnings.push(...avail.warnings);

  const memLines = findSubsection(gsLines, 'System Memory Summary');
  const mem = extractMemory(memLines);
  warnings.push(...mem.warnings);

  const currentAlertLines = findSubsection(gsLines, 'Current Alerts');
  const historyAlertLines = findSubsection(gsLines, 'Alerts History');
  const alertsResult = extractAlerts(currentAlertLines, historyAlertLines, timeZone);
  warnings.push(...alertsResult.warnings);

  const netLines = findSubsection(gsLines, 'Net Show Hardware');
  const net = extractNet(netLines);
  warnings.push(...net.warnings);

  const diskLines = findSubsection(gsLines, 'Disk Status');
  const disk = extractDisk(diskLines);
  warnings.push(...disk.warnings);

  // ── DETAILED FILESYSTEM LAYER ─────────────────────────────────────────────
  const detFsLines = sections.get('DETAILED FILESYSTEM LAYER') ?? [];
  const mtreeLines = findSubsection(detFsLines, 'Mtree List');
  const mtreesResult = extractMtrees(mtreeLines);
  warnings.push(...mtreesResult.warnings);

  // ── Assemble final report ─────────────────────────────────────────────────
  const report: ParsedReport = {
    hostname: gi.data.hostname,
    generatedAt: gi.data.generatedAt,
    reportDate: gi.data.reportDate,
    timeZone: gi.data.timeZone,
    osVersion: gi.data.osVersion,
    serialNo: gi.data.serialNo,
    chassisSerial: gi.data.chassisSerial,
    modelNo: gi.data.modelNo,
    displayName: gi.data.displayName,
    adminEmail: gi.data.adminEmail,
    location: gi.data.location,
    uptimeDays: gi.data.uptimeDays,
    loadAvg1m: gi.data.loadAvg1m,
    loadAvg5m: gi.data.loadAvg5m,
    loadAvg15m: gi.data.loadAvg15m,
    memTotalMib: mem.data?.memTotalMib ?? null,
    memFreeMib: mem.data?.memFreeMib ?? null,
    swapTotalMib: mem.data?.swapTotalMib ?? null,
    swapFreeMib: mem.data?.swapFreeMib ?? null,
    systemAvailabilityPct: avail.data?.systemAvailabilityPct ?? null,
    fsAvailabilityPct: avail.data?.fsAvailabilityPct ?? null,
    lastCleaningAt,
    capacitySnapshots: usage.data,
    compressionStats: comp.data,
    deviceAlerts: alertsResult.data,
    networkInterfaces: net.data,
    disks: disk.data,
    mtrees: mtreesResult.data,
    warnings,
  };

  return { ok: true, type: 'part_a', data: report, warnings };
}

/** Parse a raw DD autosupport string (part A text or part B JSON) and return a ParseResult. */
export function assemble(raw: string): ParseResult {
  const trimmed = raw.trimStart();
  // Part B detection: leading '{' character
  if (trimmed.startsWith('{')) {
    return assemblePartB(trimmed);
  }
  return assemblePartA(raw);
}
