'use server';

import { headers } from 'next/headers';
import { createSSRClient } from '@/lib/db/client-ssr';
import { createServiceRoleClient } from '@/lib/db/client';

export type ManualIngestResult =
  | { ok: true; data: { hostname: string; reportDate: string; deviceWasNew: boolean } }
  | { ok: false; error: { code: string; message: string } };

export async function manualIngest(
  _prevState: ManualIngestResult | null,
  formData: FormData,
): Promise<ManualIngestResult | null> {
  // Verify admin server-side — identical guard to /api/admin/*
  const supabase = await createSSRClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: { code: 'UNAUTHORIZED', message: 'You must be signed in.' } };
  }
  const { data: role } = await supabase.rpc('get_current_user_role');
  if (role !== 'admin') {
    return { ok: false, error: { code: 'FORBIDDEN', message: 'Admin role required.' } };
  }

  // Validate file
  const file = formData.get('file') as File | null;
  if (!file || file.size === 0) {
    return { ok: false, error: { code: 'INVALID', message: 'No file selected.' } };
  }

  // Upload to Storage using service role — browser never touches the key
  const admin = createServiceRoleClient();
  const uuid = crypto.randomUUID();
  const date = new Date().toISOString().slice(0, 10);
  const storagePath = `inbound/${date}/manual-${uuid}/${file.name}`;
  const emailMessageId = `manual-${uuid}`;

  const bytes = await file.arrayBuffer();
  const { error: uploadErr } = await admin.storage
    .from('raw-reports')
    .upload(storagePath, bytes, { contentType: file.type || 'application/octet-stream' });

  if (uploadErr) {
    return { ok: false, error: { code: 'UPLOAD_FAILED', message: uploadErr.message } };
  }

  // Call /api/ingest server-to-server — INGEST_SECRET never leaves the server
  const secret = process.env.INGEST_SECRET;
  if (!secret) {
    return { ok: false, error: { code: 'CONFIG_ERROR', message: 'Server not configured.' } };
  }

  const hdrs = await headers();
  const host = hdrs.get('host') ?? 'localhost:3000';
  const protocol = process.env.NODE_ENV === 'production' ? 'https' : 'http';
  const ingestUrl = `${protocol}://${host}/api/ingest`;

  let resp: Response;
  try {
    resp = await fetch(ingestUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-ingest-key': secret,
      },
      body: JSON.stringify({ storagePath, emailMessageId }),
    });
  } catch (e) {
    return { ok: false, error: { code: 'INGEST_UNREACHABLE', message: String(e) } };
  }

  if (resp.status === 409) {
    return { ok: false, error: { code: 'DUPLICATE', message: 'Already ingested for this device on this date.' } };
  }

  const json = (await resp.json()) as
    | { ok: true; data: { hostname: string; reportDate: string; deviceWasNew: boolean } }
    | { ok: false; error: { code: string; message: string } };

  if (!json.ok) {
    return { ok: false, error: json.error };
  }

  return {
    ok: true,
    data: {
      hostname: json.data.hostname,
      reportDate: json.data.reportDate,
      deviceWasNew: json.data.deviceWasNew,
    },
  };
}
