import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ParseResult } from '@/lib/parser/types';

// ─── Module mocks ─────────────────────────────────────────────────────────────

vi.mock('server-only', () => ({}));

// Mutable state controlled per-test
let mockDownloadResult: { data: Blob | null; error: unknown } = { data: null, error: null };
let mockRpcResult: { data: unknown; error: unknown } = { data: null, error: null };
let mockParseResult: ParseResult = { ok: false, error: 'not set', warnings: [] };
const mockInsert = vi.fn().mockResolvedValue({ data: null, error: null });
const mockUpdate = vi.fn().mockReturnValue({
  eq: vi.fn().mockResolvedValue({ data: null, error: null }),
});
let mockDeviceQueryResult: { data: { id: string } | null; error: null } = { data: null, error: null };
let mockReportSelectResult: { data: { id: string } | null; error: null } = { data: null, error: null };

vi.mock('@/lib/db/client', () => ({
  createServiceRoleClient: () => ({
    storage: {
      from: () => ({ download: () => Promise.resolve(mockDownloadResult) }),
    },
    rpc: () => Promise.resolve(mockRpcResult),
    from: (table: string) => {
      if (table === 'alert_rules') {
        return {
          select: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }),
        };
      }
      if (table === 'devices') {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: () => Promise.resolve(mockDeviceQueryResult) }),
          }),
        };
      }
      if (table === 'reports') {
        const chain = {
          eq: () => chain as unknown,
          maybeSingle: () => Promise.resolve(mockReportSelectResult),
        };
        return { select: () => chain, update: mockUpdate };
      }
      return { insert: mockInsert };
    },
  }),
}));

vi.mock('@/lib/parser', () => ({
  parseReport: () => mockParseResult,
}));

// ─── Test helpers ─────────────────────────────────────────────────────────────

function makeTextBlob(content: string): Blob {
  return new Blob([content], { type: 'text/plain' });
}

function makeRequest(body: unknown, key = 'test-secret'): Request {
  return new Request('http://localhost/api/ingest', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(key ? { 'x-ingest-key': key } : {}),
    },
    body: JSON.stringify(body),
  });
}

function makePartBParseResult(): ParseResult {
  return {
    ok: true,
    type: 'part_b',
    warnings: [],
    data: {
      hostname: 'DD9300.iq.zain.com',
      generatedAt: new Date(1781236745 * 1000), // 2026-06-12T03:59:05.000Z
      timeZone: 'Asia/Baghdad',
      rawJson: {},
    },
  };
}

function makeSuccessParseResult(): ParseResult {
  return {
    ok: true,
    type: 'part_a',
    warnings: [],
    data: {
      hostname: 'DDBag.iq.zain.com',
      generatedAt: new Date('2026-06-14T09:00:00Z'),
      reportDate: '2026-06-14',
      timeZone: 'Asia/Baghdad',
      osVersion: '7.7.1.60',
      serialNo: 'ABC001',
      chassisSerial: null,
      modelNo: 'DD6300',
      displayName: 'DDBag',
      adminEmail: null,
      location: null,
      uptimeDays: 120,
      loadAvg1m: 1.5,
      loadAvg5m: 1.2,
      loadAvg15m: 1.0,
      memTotalMib: 32768,
      memFreeMib: 8192,
      swapTotalMib: 4096,
      swapFreeMib: 4096,
      systemAvailabilityPct: 99.9,
      fsAvailabilityPct: 99.8,
      lastCleaningAt: null,
      capacitySnapshots: [],
      compressionStats: [],
      deviceAlerts: [],
      networkInterfaces: [],
      disks: null,
      mtrees: [],
      warnings: [],
    },
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('POST /api/ingest', () => {
  beforeEach(() => {
    process.env.INGEST_SECRET = 'test-secret';
    mockDownloadResult = { data: makeTextBlob('raw report content'), error: null };
    mockRpcResult = {
      data: {
        report_id: 'report-uuid-1',
        device_id: 'device-uuid-1',
        device_was_new: false,
        status: 'ingested',
      },
      error: null,
    };
    mockParseResult = makeSuccessParseResult();
    mockInsert.mockResolvedValue({ data: null, error: null });
    mockUpdate.mockClear();
    mockUpdate.mockReturnValue({ eq: vi.fn().mockResolvedValue({ data: null, error: null }) });
    mockDeviceQueryResult = { data: null, error: null };
    mockReportSelectResult = { data: null, error: null };
  });

  afterEach(() => {
    delete process.env.INGEST_SECRET;
  });

  it('returns 401 when x-ingest-key is missing', async () => {
    const { POST } = await import('../route');
    const req = makeRequest({ storagePath: 'raw-reports/file.txt', emailMessageId: 'msg-1' }, '');
    const resp = await POST(req);
    expect(resp.status).toBe(401);
    const body = await resp.json();
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe('UNAUTHORIZED');
  });

  it('returns 401 when x-ingest-key is wrong', async () => {
    const { POST } = await import('../route');
    const req = makeRequest(
      { storagePath: 'raw-reports/file.txt', emailMessageId: 'msg-1' },
      'wrong-key',
    );
    const resp = await POST(req);
    expect(resp.status).toBe(401);
  });

  it('returns 400 for invalid body schema', async () => {
    const { POST } = await import('../route');
    const req = makeRequest({ badField: true });
    const resp = await POST(req);
    expect(resp.status).toBe(400);
    const body = await resp.json();
    expect(body.error.code).toBe('INVALID_BODY');
  });

  it('returns 422 when parse fails', async () => {
    mockParseResult = { ok: false, error: 'HARD_FAIL: HOSTNAME missing', warnings: [] };
    const { POST } = await import('../route');
    const req = makeRequest({ storagePath: 'raw-reports/file.txt', emailMessageId: 'msg-1' });
    const resp = await POST(req);
    expect(resp.status).toBe(422);
    const body = await resp.json();
    expect(body.error.code).toBe('PARSE_FAILED');
  });

  it('happy path — returns 200 with report data', async () => {
    const { POST } = await import('../route');
    const req = makeRequest({ storagePath: 'raw-reports/file.txt', emailMessageId: 'msg-1' });
    const resp = await POST(req);
    expect(resp.status).toBe(200);
    const body = await resp.json();
    expect(body.ok).toBe(true);
    expect(body.data.hostname).toBe('DDBag.iq.zain.com');
    expect(body.data.reportDate).toBe('2026-06-14');
    expect(body.data.reportId).toBe('report-uuid-1');
  });

  it('happy path — always writes ingest_log with outcome=ingested', async () => {
    const { POST } = await import('../route');
    const req = makeRequest({ storagePath: 'raw-reports/file.txt', emailMessageId: 'msg-2' });
    await POST(req);
    // ingest_log insert is one of the calls to mockInsert
    const calls = mockInsert.mock.calls as [Record<string, unknown>][];
    const logCall = calls.find(([row]) => row.outcome === 'ingested' && row.email_message_id === 'msg-2');
    expect(logCall).toBeDefined();
  });

  it('duplicate — returns 409 on DUPLICATE_REPORT from RPC', async () => {
    mockRpcResult = { data: null, error: { message: 'DUPLICATE_REPORT', code: 'P0001' } };
    const { POST } = await import('../route');
    const req = makeRequest({ storagePath: 'raw-reports/file.txt', emailMessageId: 'msg-dup' });
    const resp = await POST(req);
    expect(resp.status).toBe(409);
    const body = await resp.json();
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe('DUPLICATE');
  });

  it('duplicate — writes ingest_log with outcome=skipped_duplicate', async () => {
    mockRpcResult = { data: null, error: { message: 'DUPLICATE_REPORT', code: 'P0001' } };
    const { POST } = await import('../route');
    const req = makeRequest({ storagePath: 'raw-reports/file.txt', emailMessageId: 'msg-dup2' });
    await POST(req);
    const calls = mockInsert.mock.calls as [Record<string, unknown>][];
    const logCall = calls.find(([row]) => row.outcome === 'skipped_duplicate' && row.email_message_id === 'msg-dup2');
    expect(logCall).toBeDefined();
  });

  it('second identical call returns 409 while first returned 200', async () => {
    // First call: success
    const { POST } = await import('../route');
    const firstReq = makeRequest({ storagePath: 'raw-reports/file.txt', emailMessageId: 'msg-3' });
    const firstResp = await POST(firstReq);
    expect(firstResp.status).toBe(200);

    // Second call: simulate DB returning DUPLICATE
    mockRpcResult = { data: null, error: { message: 'DUPLICATE_REPORT', code: 'P0001' } };
    const secondReq = makeRequest({ storagePath: 'raw-reports/file.txt', emailMessageId: 'msg-3' });
    const secondResp = await POST(secondReq);
    expect(secondResp.status).toBe(409);
  });

  it('handles gzipped files (path ending .gz)', async () => {
    // zlib.gunzipSync of non-gz data would throw; provide valid gzip bytes
    const { gzipSync } = await import('zlib');
    const gzipped = gzipSync(Buffer.from('raw report content'));
    mockDownloadResult = { data: new Blob([gzipped]), error: null };

    const { POST } = await import('../route');
    const req = makeRequest({
      storagePath: 'raw-reports/file.txt.gz',
      emailMessageId: 'msg-gz',
    });
    const resp = await POST(req);
    // parseReport is mocked to return success, so we expect 200
    expect(resp.status).toBe(200);
  });

  it('returns 502 when storage download fails', async () => {
    mockDownloadResult = { data: null, error: { message: 'Not found' } };
    const { POST } = await import('../route');
    const req = makeRequest({ storagePath: 'raw-reports/missing.txt', emailMessageId: 'msg-4' });
    const resp = await POST(req);
    expect(resp.status).toBe(502);
    const body = await resp.json();
    expect(body.error.code).toBe('STORAGE_READ_FAILED');
  });

  it('part B — links to existing Part A report and returns { linked: true }', async () => {
    mockParseResult = makePartBParseResult();
    mockDeviceQueryResult = { data: { id: 'device-uuid-bag' }, error: null };
    mockReportSelectResult = { data: { id: 'report-uuid-bag' }, error: null };

    const { POST } = await import('../route');
    const req = makeRequest({
      storagePath: 'raw-reports/dd713_bag_partb_2026-06-12.json',
      emailMessageId: 'msg-partb-linked',
    });
    const resp = await POST(req);
    expect(resp.status).toBe(200);
    const body = await resp.json();
    expect(body.ok).toBe(true);
    expect(body.data.linked).toBe(true);
    expect(body.data.reportId).toBe('report-uuid-bag');
    expect(mockUpdate).toHaveBeenCalledWith({
      partb_storage_path: 'raw-reports/dd713_bag_partb_2026-06-12.json',
    });
  });

  it('part B — defers cleanly when no matching device found (200, no crash)', async () => {
    mockParseResult = makePartBParseResult();
    // mockDeviceQueryResult stays { data: null } from beforeEach

    const { POST } = await import('../route');
    const req = makeRequest({
      storagePath: 'raw-reports/dd713_bag_partb_2026-06-12.json',
      emailMessageId: 'msg-partb-deferred',
    });
    const resp = await POST(req);
    expect(resp.status).toBe(200);
    const body = await resp.json();
    expect(body.ok).toBe(true);
    expect(body.data.deferred).toBe('partB has no matching report yet');
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});
