import { redirect }        from 'next/navigation';
import Link                from 'next/link';
import { createSSRClient } from '@/lib/db/client-ssr';
import { fetchIngestLog }  from '@/lib/db/queries';

export const dynamic = 'force-dynamic';

const OUTCOME_COLOR: Record<string, string> = {
  ingested:          'var(--ok)',
  skipped_duplicate: 'var(--muted)',
  parse_failed:      'var(--crit)',
  auth_failed:       'var(--warn)',
};
const OUTCOME_LABEL: Record<string, string> = {
  ingested:          'Ingested',
  skipped_duplicate: 'Duplicate',
  parse_failed:      'Parse failed',
  auth_failed:       'Auth failed',
};

function formatBaghdad(iso: string) {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Baghdad',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    }).format(new Date(iso)).replace(',', '');
  } catch {
    return iso;
  }
}

export default async function ReportsPage() {
  const supabase = await createSSRClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { logs, todayCounts } = await fetchIngestLog(supabase);

  const totalToday = Object.values(todayCounts).reduce((s, v) => s + v, 0);

  return (
    <div style={{ maxWidth: 1280, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
            Reports Log
          </h1>
          <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: '0.2rem' }}>
            Most recent 100 ingest attempts
          </p>
        </div>
        <Link
          href="/reports/upload"
          style={{
            padding: '0.45rem 1rem', borderRadius: 6,
            background: 'var(--accent)', color: '#fff',
            fontSize: 13, fontWeight: 600, textDecoration: 'none',
          }}
        >
          Upload a report
        </Link>
      </div>

      {/* Today summary */}
      {totalToday > 0 && (
        <div style={{
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 8, padding: '0.75rem 1.25rem',
          display: 'flex', gap: '2rem', flexWrap: 'wrap',
          alignItems: 'center', marginBottom: '1rem',
        }}>
          <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>Today</span>
          {(Object.entries(todayCounts) as [string, number][])
            .filter(([, v]) => v > 0)
            .map(([outcome, count]) => (
              <div key={outcome} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <span style={{ fontSize: 18, fontWeight: 700, color: OUTCOME_COLOR[outcome], fontVariantNumeric: 'tabular-nums' }}>
                  {count}
                </span>
                <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                  {OUTCOME_LABEL[outcome] ?? outcome}
                </span>
              </div>
            ))
          }
        </div>
      )}

      {/* Log table */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8 }}>
        {logs.length === 0 ? (
          <p style={{ padding: '3rem', textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
            No ingest activity yet.
          </p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['Time (Baghdad)', 'Device', 'Outcome', 'Duration', 'Message ID'].map(h => (
                    <th key={h} style={{
                      textAlign: 'left', padding: '0.6rem 1rem',
                      color: 'var(--muted)', fontWeight: 600, fontSize: 11, whiteSpace: 'nowrap',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {logs.map(l => (
                  <tr key={l.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '0.55rem 1rem', color: 'var(--muted)', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                      {formatBaghdad(l.created_at)}
                    </td>
                    <td style={{ padding: '0.55rem 1rem', whiteSpace: 'nowrap' }}>
                      {l.device ? (
                        <Link href={`/devices/${l.device.id}`} style={{ color: 'var(--accent-text)', textDecoration: 'none', fontFamily: 'monospace', fontSize: 12 }}>
                          {l.device.display_name ?? l.device_hostname ?? '—'}
                        </Link>
                      ) : (
                        <span style={{ color: 'var(--muted)', fontFamily: 'monospace' }}>
                          {l.device_hostname ?? '—'}
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '0.55rem 1rem', whiteSpace: 'nowrap' }}>
                      <span style={{ color: OUTCOME_COLOR[l.outcome] ?? 'var(--muted)', fontWeight: 600 }}>
                        {OUTCOME_LABEL[l.outcome] ?? l.outcome}
                      </span>
                    </td>
                    <td style={{ padding: '0.55rem 1rem', color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>
                      {l.duration_ms !== null ? `${l.duration_ms} ms` : '—'}
                    </td>
                    <td style={{ padding: '0.55rem 1rem', color: 'var(--muted)', fontFamily: 'monospace', fontSize: 11 }}>
                      <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 260 }}>
                        {l.email_message_id ?? '—'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
