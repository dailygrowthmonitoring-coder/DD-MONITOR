'use client';

import { useActionState } from 'react';
import { manualIngest, type ManualIngestResult } from './actions';

export default function UploadPage() {
  const [state, formAction, isPending] = useActionState<ManualIngestResult | null, FormData>(
    manualIngest,
    null,
  );

  return (
    <main style={{ padding: '2rem', maxWidth: '600px' }}>
      <h1>Manual Report Upload</h1>
      <p>Upload a DD autosupport report (.txt, .json, or .gz) to ingest it immediately.</p>

      <form action={formAction} style={{ marginTop: '1.5rem' }}>
        <input
          name="file"
          type="file"
          accept=".txt,.json,.gz"
          disabled={isPending}
          style={{ display: 'block', marginBottom: '1rem' }}
        />
        <button type="submit" disabled={isPending} style={{ padding: '0.5rem 1.25rem' }}>
          {isPending ? 'Uploading…' : 'Upload & Ingest'}
        </button>
      </form>

      {state?.ok === true && (
        <div style={{ marginTop: '1.5rem', color: 'green' }}>
          <strong>Success.</strong> Report for <code>{state.data.hostname}</code> dated{' '}
          <code>{state.data.reportDate}</code> ingested.
          {state.data.deviceWasNew && ' (new device registered)'}
        </div>
      )}

      {state?.ok === false && state.error.code === 'DUPLICATE' && (
        <div style={{ marginTop: '1.5rem', color: 'darkorange' }}>
          <strong>Already ingested.</strong> A report for this device on this date already exists.
          No changes were made.
        </div>
      )}

      {state?.ok === false && state.error.code !== 'DUPLICATE' && (
        <div style={{ marginTop: '1.5rem', color: 'red' }}>
          <strong>Error [{state.error.code}]:</strong> {state.error.message}
        </div>
      )}
    </main>
  );
}
