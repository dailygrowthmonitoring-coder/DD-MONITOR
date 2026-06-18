import type { DeviceDetail } from '@/lib/db/queries';

const SEV_COLOR: Record<string, string> = {
  CRITICAL: 'var(--crit)',
  WARNING:  'var(--warn)',
  INFO:     'var(--accent)',
  NOTICE:   'var(--muted)',
};

export function AlertsTab({ detail }: { detail: DeviceDetail }) {
  const { alerts } = detail;

  if (alerts.length === 0) {
    return (
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 8, padding: '2.5rem', textAlign: 'center',
      }}>
        <p style={{ color: 'var(--ok)', fontWeight: 600, fontSize: 15 }}>No active alerts</p>
        <p style={{ color: 'var(--muted)', fontSize: 12, marginTop: 4 }}>Device is operating within normal parameters</p>
      </div>
    );
  }

  const active   = alerts.filter(a => a.is_active);
  const resolved = alerts.filter(a => !a.is_active);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {active.length > 0 && (
        <div style={cardStyle}>
          <h4 style={sectionTitle}>Active ({active.length})</h4>
          <AlertList rows={active} />
        </div>
      )}
      {resolved.length > 0 && (
        <div style={cardStyle}>
          <h4 style={sectionTitle}>Resolved ({resolved.length})</h4>
          <AlertList rows={resolved} />
        </div>
      )}
    </div>
  );
}

function AlertList({ rows }: { rows: DeviceDetail['alerts'] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      {rows.map(a => {
        const color = SEV_COLOR[a.severity] ?? 'var(--muted)';
        return (
          <div key={a.id} style={{
            borderLeft: `3px solid ${color}`,
            paddingLeft: '0.75rem',
            paddingTop: '0.5rem',
            paddingBottom: '0.5rem',
          }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', marginBottom: 2 }}>
              <span style={{ color, fontSize: 11, fontWeight: 700 }}>{a.severity}</span>
              <span style={{ color: 'var(--muted)', fontSize: 11 }}>{a.class}</span>
              {a.object && <span style={{ color: 'var(--muted)', fontSize: 11 }}>· {a.object}</span>}
            </div>
            <p style={{ fontSize: 13, color: 'var(--text-primary)', margin: 0 }}>{a.message}</p>
            <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
              {new Date(a.posted_at).toLocaleString('en-GB', { timeZone: 'Asia/Baghdad' })}
            </p>
          </div>
        );
      })}
    </div>
  );
}

const cardStyle: React.CSSProperties = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '1rem 1.25rem' };
const sectionTitle: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: '0.75rem' };
