import Link from 'next/link';

type AlertWithDevice = {
  id: string;
  alert_id: string;
  severity: string;
  class: string;
  message: string;
  reports?: {
    device_id?: string;
    devices?: { id?: string; display_name?: string | null; hostname?: string } | null;
  } | null;
};

const SEV_COLOR: Record<string, string> = {
  CRITICAL: 'var(--crit)',
  WARNING:  'var(--warn)',
  INFO:     'var(--muted)',
  NOTICE:   'var(--muted)',
};

export function ActiveAlertsPanel({ alerts }: { alerts: AlertWithDevice[] }) {
  return (
    <div style={{
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 8,
      padding: '1rem 1.25rem',
      display: 'flex',
      flexDirection: 'column',
    }}>
      <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 0.75rem' }}>
        Active Alerts
      </h3>

      {alerts.length === 0 ? (
        <p style={{ fontSize: 13, color: 'var(--muted)', padding: '1rem 0', textAlign: 'center' }}>
          No active alerts today
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {alerts.map(a => {
            const dev = (a.reports as { devices?: { id?: string; display_name?: string | null; hostname?: string } | null } | null)?.devices;
            return (
              <div key={a.id} style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.4rem 0',
                borderBottom: '1px solid var(--border)',
              }}>
                <span style={{
                  width: 6, height: 6, borderRadius: '50%',
                  background: SEV_COLOR[a.severity] ?? 'var(--muted)',
                  flexShrink: 0,
                }} />
                <span style={{ fontSize: 11, color: SEV_COLOR[a.severity], fontWeight: 600, width: 64, flexShrink: 0 }}>
                  {a.severity}
                </span>
                <span style={{ fontSize: 12, color: 'var(--muted)', width: 64, flexShrink: 0 }}>{a.class}</span>
                <span style={{ fontSize: 12, color: 'var(--text-primary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {a.message}
                </span>
                {dev?.id && (
                  <Link href={`/devices/${dev.id}`} style={{ fontSize: 11, color: 'var(--accent-text)', flexShrink: 0, textDecoration: 'none' }}>
                    {dev.display_name ?? dev.hostname}
                  </Link>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
