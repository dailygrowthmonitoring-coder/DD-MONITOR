import type { Tables } from '@/lib/db/types';

type NotifRow = Pick<Tables<'system_notifications'>, 'type' | 'severity'>;

const TYPE_LABEL: Record<string, string> = {
  report_received:  'Received',
  report_missing:   'Missing',
  critical_finding: 'Critical',
  new_device:       'New device',
};
const TYPE_COLOR: Record<string, string> = {
  report_received:  'var(--ok)',
  report_missing:   'var(--warn)',
  critical_finding: 'var(--crit)',
  new_device:       'var(--accent-text)',
};

export function NotificationsStrip({ notifications }: { notifications: NotifRow[] }) {
  if (notifications.length === 0) return null;

  const counts: Record<string, number> = {};
  for (const n of notifications) {
    counts[n.type] = (counts[n.type] ?? 0) + 1;
  }

  return (
    <div style={{
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 8,
      padding: '0.75rem 1.25rem',
      display: 'flex',
      alignItems: 'center',
      gap: '1.5rem',
      flexWrap: 'wrap',
    }}>
      <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>Today&apos;s notifications</span>
      {Object.entries(counts).map(([type, count]) => (
        <div key={type} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <span style={{
            width: 8, height: 8, borderRadius: '50%',
            background: TYPE_COLOR[type] ?? 'var(--muted)',
            flexShrink: 0,
          }} />
          <span style={{ fontSize: 13, color: TYPE_COLOR[type] ?? 'var(--muted)', fontWeight: 600 }}>
            {count}
          </span>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>{TYPE_LABEL[type] ?? type}</span>
        </div>
      ))}
    </div>
  );
}
