import type { DeviceDetail } from '@/lib/db/queries';

const STATUS_COLOR: Record<string, string> = {
  rw:      'var(--ok)',
  ro:      'var(--warn)',
  deleted: 'var(--crit)',
};

export function MTreesTab({ detail }: { detail: DeviceDetail }) {
  const { mtrees } = detail;

  if (mtrees.length === 0) {
    return <Empty msg="No MTree data in the latest report" />;
  }

  const totalPrecomp = mtrees.reduce((s, m) => s + Number(m.precomp_gib), 0);

  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 8, overflow: 'hidden',
    }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            {['MTree Path', 'Pre-comp (GiB)', 'Status'].map(h => (
              <th key={h} style={thStyle}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {mtrees.map(m => {
            const statusColor = STATUS_COLOR[m.status ?? ''] ?? 'var(--muted)';
            return (
              <tr key={m.id} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ ...tdStyle, fontFamily: 'monospace', fontSize: 12 }}>{m.mtree_path}</td>
                <td style={{ ...tdStyle, fontVariantNumeric: 'tabular-nums' }}>
                  {Number(m.precomp_gib).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </td>
                <td style={tdStyle}>
                  <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: statusColor }}>
                    {m.status ?? '—'}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div style={{
        padding: '0.5rem 0.75rem', borderTop: '1px solid var(--border)',
        display: 'flex', gap: '1.5rem',
      }}>
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>{mtrees.length} MTrees</span>
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>
          Total pre-comp: {totalPrecomp.toLocaleString(undefined, { maximumFractionDigits: 0 })} GiB
        </span>
      </div>
    </div>
  );
}

function Empty({ msg }: { msg: string }) {
  return <p style={{ color: 'var(--muted)', fontSize: 13, padding: '2rem 0', textAlign: 'center' }}>{msg}</p>;
}

const thStyle: React.CSSProperties = {
  textAlign: 'left', color: 'var(--muted)', fontWeight: 600, fontSize: 11,
  padding: '0.4rem 0.75rem',
};
const tdStyle: React.CSSProperties = {
  padding: '0.45rem 0.75rem', color: 'var(--text-primary)',
};
