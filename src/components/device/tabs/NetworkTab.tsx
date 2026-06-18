import type { DeviceDetail } from '@/lib/db/queries';

type Port = DeviceDetail['network'][number];

function portColor(p: Port): string {
  if (p.state === 'running') return 'var(--ok)';
  if (p.state === 'fault')   return 'var(--crit)';
  return 'var(--muted)';
}
function portLabel(p: Port): string {
  if (p.state === 'running') return 'Running';
  if (p.state === 'fault')   return 'Fault';
  return 'Down';
}

export function NetworkTab({ detail }: { detail: DeviceDetail }) {
  const { network } = detail;

  if (network.length === 0) {
    return <Empty msg="No network interface data in the latest report" />;
  }

  const sorted = [...network].sort((a, b) => a.port.localeCompare(b.port));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Legend */}
      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
        {[
          { color: 'var(--ok)',    label: 'Running' },
          { color: 'var(--muted)', label: 'Down' },
          { color: 'var(--crit)', label: 'Fault' },
        ].map(({ color, label }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>{label}</span>
          </div>
        ))}
      </div>

      {/* Port grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
        gap: '0.5rem',
      }}>
        {sorted.map(p => {
          const color = portColor(p);
          return (
            <div key={p.id} style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderLeft: `3px solid ${color}`,
              borderRadius: 6,
              padding: '0.6rem 0.75rem',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'monospace' }}>{p.port}</span>
                <span style={{ fontSize: 11, fontWeight: 700, color, textTransform: 'uppercase' }}>{portLabel(p)}</span>
              </div>
              {(p.speed !== null || p.duplex !== null) && (
                <div style={{ marginTop: 4, fontSize: 11, color: 'var(--muted)', display: 'flex', gap: '0.75rem' }}>
                  {p.speed && <span>{p.speed}</span>}
                  {p.duplex && <span>{p.duplex}</span>}
                </div>
              )}
              {p.hardware_address && (
                <div style={{ marginTop: 2, fontSize: 11, color: 'var(--muted)', fontFamily: 'monospace' }}>{p.hardware_address}</div>
              )}
            </div>
          );
        })}
      </div>

      {/* Summary counts */}
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 8, padding: '0.75rem 1.25rem',
        display: 'flex', gap: '2rem', flexWrap: 'wrap',
      }}>
        {(['running', 'down', 'fault'] as const).map(state => {
          const count = network.filter(p => p.state === state).length;
          const label = state === 'running' ? 'Running' : state === 'fault' ? 'Fault' : 'Down';
          const color = state === 'running' ? 'var(--ok)' : state === 'fault' ? 'var(--crit)' : 'var(--muted)';
          return (
            <div key={state} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <span style={{ fontSize: 20, fontWeight: 700, color, fontVariantNumeric: 'tabular-nums' }}>{count}</span>
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>{label}</span>
            </div>
          );
        })}
        <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--muted)' }}>{network.length} total ports</span>
      </div>
    </div>
  );
}

function Empty({ msg }: { msg: string }) {
  return <p style={{ color: 'var(--muted)', fontSize: 13, padding: '2rem 0', textAlign: 'center' }}>{msg}</p>;
}
