/**
 * Throwaway dev script — end-to-end ingest smoke test (no login required).
 * Uploads a real report file to Supabase Storage via service role, then
 * POSTs to /api/ingest on localhost:3000 and prints the full JSON response.
 *
 * Usage:
 *   pnpm tsx --env-file .env.local scripts/test-ingest.ts <path-to-report>
 *
 * The dev server (pnpm dev) must be running on port 3000.
 */

import { readFileSync } from 'fs';
import { basename } from 'path';
import { randomUUID } from 'crypto';
import { createClient } from '@supabase/supabase-js';

const filePath = process.argv[2];
if (!filePath) {
  console.error('Usage: pnpm tsx --env-file .env.local scripts/test-ingest.ts <path-to-report>');
  process.exit(1);
}

async function main() {
  const supabaseUrl    = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const ingestSecret   = process.env.INGEST_SECRET;

  if (!supabaseUrl || !serviceRoleKey || !ingestSecret) {
    console.error('Missing env vars. Make sure .env.local is loaded (use --env-file .env.local).');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // ── 1. Read the file ────────────────────────────────────────────────────────

  const fileBytes = readFileSync(filePath);
  const fileName  = basename(filePath);
  const uuid      = randomUUID();
  const storagePath    = `test/manual-${uuid}/${fileName}`;
  const emailMessageId = `test-manual-${uuid}`;

  const contentType = fileName.endsWith('.json') ? 'application/json'
                    : fileName.endsWith('.gz')   ? 'application/gzip'
                    : 'text/plain';

  // ── 2. Upload to Supabase Storage (service role, bypasses auth) ─────────────

  console.log(`\nUploading  ${fileName}`);
  console.log(`  bucket   raw-reports`);
  console.log(`  path     ${storagePath}`);

  const { error: uploadErr } = await supabase.storage
    .from('raw-reports')
    .upload(storagePath, fileBytes, { contentType });

  if (uploadErr) {
    console.error('\nStorage upload failed:', uploadErr.message);
    process.exit(1);
  }

  console.log('  upload   OK');

  // ── 3. Call /api/ingest ─────────────────────────────────────────────────────

  console.log('\nPOST http://localhost:3000/api/ingest');
  console.log(`  emailMessageId  ${emailMessageId}`);

  const resp = await fetch('http://localhost:3000/api/ingest', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-ingest-key': ingestSecret,
    },
    body: JSON.stringify({ storagePath, emailMessageId }),
  });

  // ── 4. Print full response ──────────────────────────────────────────────────

  const json: unknown = await resp.json();
  console.log(`\nHTTP ${resp.status}`);
  console.log(JSON.stringify(json, null, 2));
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
