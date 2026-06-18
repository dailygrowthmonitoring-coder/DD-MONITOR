'use client';

import { useState, useRef } from 'react';
import { createBrowserClient } from '@/lib/db/client-browser';

type UploadState =
  | { phase: 'idle' }
  | { phase: 'uploading' }
  | { phase: 'success'; hostname: string; reportDate: string; deviceWasNew: boolean }
  | { phase: 'duplicate' }
  | { phase: 'error'; code: string; message: string };

export default function UploadPage() {
  const [state, setState] = useState<UploadState>({ phase: 'idle' });
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleUpload() {
    const file = fileRef.current?.files?.[0];
    if (!file) return;

    setState({ phase: 'uploading' });

    const supabase = createBrowserClient();

    // Verify active session
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      setState({ phase: 'error', code: 'UNAUTHORIZED', message: 'You must be signed in.' });
      return;
    }

    // Check admin role
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('user_id', session.user.id)
      .single();

    if (profile?.role !== 'admin') {
      setState({ phase: 'error', code: 'FORBIDDEN', message: 'Admin role required.' });
      return;
    }

    // Build storage path: raw-reports/{date}/manual-{uuid}/{filename}
    const uuid = crypto.randomUUID();
    const date = new Date().toISOString().slice(0, 10);
    const storagePath = `raw-reports/${date}/manual-${uuid}/${file.name}`;
    const emailMessageId = `manual-${uuid}`;

    // Upload file to Supabase Storage
    const { error: uploadErr } = await supabase.storage
      .from('raw-reports')
      .upload(storagePath, file);

    if (uploadErr) {
      setState({ phase: 'error', code: 'UPLOAD_FAILED', message: uploadErr.message });
      return;
    }

    // Call ingest API
    const resp = await fetch('/api/ingest', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-ingest-key': process.env.NEXT_PUBLIC_INGEST_SECRET ?? '',
      },
      body: JSON.stringify({ storagePath, emailMessageId }),
    });

    const json = (await resp.json()) as
      | { ok: true; data: { hostname: string; reportDate: string; deviceWasNew: boolean } }
      | { ok: false; error: { code: string; message: string } };

    if (resp.status === 409) {
      setState({ phase: 'duplicate' });
      return;
    }

    if (!json.ok) {
      setState({ phase: 'error', code: json.error.code, message: json.error.message });
      return;
    }

    setState({
      phase: 'success',
      hostname: json.data.hostname,
      reportDate: json.data.reportDate,
      deviceWasNew: json.data.deviceWasNew,
    });

    // Reset file input
    if (fileRef.current) fileRef.current.value = '';
  }

  return (
    <main style={{ padding: '2rem', maxWidth: '600px' }}>
      <h1>Manual Report Upload</h1>
      <p>Upload a DD autosupport report (.txt, .json, or .gz) to ingest it immediately.</p>

      <div style={{ marginTop: '1.5rem' }}>
        <input
          ref={fileRef}
          type="file"
          accept=".txt,.json,.gz"
          disabled={state.phase === 'uploading'}
          style={{ display: 'block', marginBottom: '1rem' }}
        />
        <button
          onClick={handleUpload}
          disabled={state.phase === 'uploading'}
          style={{ padding: '0.5rem 1.25rem' }}
        >
          {state.phase === 'uploading' ? 'Uploading…' : 'Upload & Ingest'}
        </button>
      </div>

      {state.phase === 'success' && (
        <div style={{ marginTop: '1.5rem', color: 'green' }}>
          <strong>Success.</strong> Report for <code>{state.hostname}</code> dated{' '}
          <code>{state.reportDate}</code> ingested.
          {state.deviceWasNew && ' (new device registered)'}
        </div>
      )}

      {state.phase === 'duplicate' && (
        <div style={{ marginTop: '1.5rem', color: 'darkorange' }}>
          <strong>Already ingested.</strong> A report for this device on this date already exists.
          No changes were made.
        </div>
      )}

      {state.phase === 'error' && (
        <div style={{ marginTop: '1.5rem', color: 'red' }}>
          <strong>Error [{state.code}]:</strong> {state.message}
        </div>
      )}
    </main>
  );
}
