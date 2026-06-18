import type { DeviceDetail } from '@/lib/db/queries';

const PERIOD_LABEL: Record<string, string> = {
  last_24_hrs:    'Last 24 hrs',
  last_7_days:    'Last 7 days',
  currently_used: 'Currently used',
};

export function CompressionTab({ detail }: { detail: DeviceDetail }) {
  const { compression } = detail;
  if (compression.length === 0) {
    return <Empty msg="No compression data in the latest report" />;
  }

  const by24  = compression.find(c => c.period === 'last_24_hrs');
  const by7   = compression.find(c => c.period === 'last_7_days');
  const byCur = compression.find(c => c.period === 'currently_used');

  const cols = [by24, by7].filter(Boolean);

  const rows: { label: string; fn: (c: typeof by24) => string }[] = [
    { label: 'Pre-comp written (GiB)',  fn: c => c ? Number(c.precomp_gib).toLocaleString(undefined, { maximumFractionDigits: 0 }) : '—' },
    { label: 'Post-comp written (GiB)', fn: c => c ? Number(c.postcomp_gib).toLocaleString(undefined, { maximumFractionDigits: 0 }) : '—' },
    { label: 'Total comp factor',       fn: c => c ? `${Number(c.total_comp_factor).toFixed(1)}×` : '—' },
    { label: 'Reduction %',             fn: c => c ? `${Math.round(Number(c.reduction_pct))}%` : '—' },
    { label: 'Global comp factor',      fn: c => (c?.global_comp_factor !== null && c?.global_comp_factor !== undefined) ? `${Number(c.global_comp_factor).toFixed(1)}×` : '—' },
    { label: 'Local comp factor',       fn: c => (c?.local_comp_factor !== null && c?.local_comp_factor !== undefined) ? `${Number(c.local_comp_factor).toFixed(1)}×` : '—' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <div style={cardStyle}>
        <h4 style={sectionTitle}>Periodic Stats</h4>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thStyle}>Metric</th>
              {cols.map(c => (
                <th key={c!.period} style={thStyle}>{PERIOD_LABEL[c!.period]}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <tr key={row.label}>
                <td style={{ ...tdStyle, color: 'var(--muted)' }}>{row.label}</td>
                {cols.map(c => (
                  <td key={c!.period} style={{ ...tdStyle, fontVariantNumeric: 'tabular-nums' }}>{row.fn(c)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {byCur && (
        <div style={cardStyle}>
          <h4 style={sectionTitle}>Currently used</h4>
          <table style={tableStyle}>
            <tbody>
              <StatRow label="Pre-comp (GiB)"    value={Number(byCur.precomp_gib).toLocaleString(undefined, { maximumFractionDigits: 0 })} />
              <StatRow label="Post-comp (GiB)"   value={Number(byCur.postcomp_gib).toLocaleString(undefined, { maximumFractionDigits: 0 })} />
              <StatRow label="Total comp factor" value={`${Number(byCur.total_comp_factor).toFixed(1)}×`} />
              <StatRow label="Reduction %"       value={`${Math.round(Number(byCur.reduction_pct))}%`} />
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <tr>
      <td style={{ ...tdStyle, color: 'var(--muted)', width: '50%' }}>{label}</td>
      <td style={{ ...tdStyle, fontVariantNumeric: 'tabular-nums' }}>{value}</td>
    </tr>
  );
}
function Empty({ msg }: { msg: string }) {
  return <p style={{ color: 'var(--muted)', fontSize: 13, padding: '2rem 0', textAlign: 'center' }}>{msg}</p>;
}

const cardStyle: React.CSSProperties = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '1rem 1.25rem' };
const sectionTitle: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: '0.75rem' };
const tableStyle: React.CSSProperties = { width: '100%', borderCollapse: 'collapse', fontSize: 13 };
const thStyle: React.CSSProperties = { textAlign: 'left', color: 'var(--muted)', fontWeight: 600, fontSize: 11, padding: '0.3rem 0.5rem', borderBottom: '1px solid var(--border)' };
const tdStyle: React.CSSProperties = { padding: '0.4rem 0.5rem', color: 'var(--text-primary)', borderBottom: '1px solid var(--border)' };
