'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { AlertCenterAlert, AlertCenterNotif } from '@/lib/db/queries';

const GROUPS = ['BAG', 'OFFSET', 'AVAMAR'] as const;

const SEV_COLOR: Record<string, string> = {
  CRITICAL: 'var(--crit)',
  WARNING:  'var(--warn)',
  INFO:     'var(--muted)',
  NOTICE:   'var(--muted)',
  critical: 'var(--crit)',
  warning:  'var(--warn)',
  info:     'var(--muted)',
};

function formatBaghdad(iso: string) {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Baghdad',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(new Date(iso)).replace(',', '');
  } catch {
    return iso;
  }
}

interface Props {
  deviceAlerts:  AlertCenterAlert[];
  notifications: AlertCenterNotif[];
}

export function AlertsClient({ deviceAlerts, notifications }: Props) {
  const [sevFilter,   setSevFilter]   = useState<'all' | 'CRITICAL' | 'WARNING'>('all');
  const [groupFilter, setGroupFilter] = useState<string>('all');

  // Apply filters to device alerts
  const filteredAlerts = deviceAlerts.filter(a => {
    if (sevFilter !== 'all' && a.severity !== sevFilter) return false;
    if (groupFilter !== 'all' && a.device_group !== groupFilter) return false;
    return true;
  });

  // Apply group filter to notifications
  const filteredNotifs = notifications.filter(n => {
    if (groupFilter !== 'all' && n.device_group !== groupFilter) return false;
    return true;
  });

  const chipStyle = (active: boolean): React.CSSProperties => ({
    padding: '0.25rem 0.75rem',
    borderRadius: 4,
    border: `1px solid ${active ? 'var(--border-2, #374151)' : 'var(--border)'}`,
    background: active ? 'rgba(124,58,237,0.15)' : 'transparent',
    color: active ? 'var(--accent-text)' : 'var(--muted)',
    fontSize: 12, fontWeight: 600, cursor: 'pointer',
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Filter chips */}
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 8, padding: '0.75rem 1.25rem',
        display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center',
      }}>
        <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600, marginRight: 4 }}>Severity</span>
        {(['all', 'CRITICAL', 'WARNING'] as const).map(s => (
          <button key={s} style={chipStyle(sevFilter === s)} onClick={() => setSevFilter(s)}>
            {s === 'all' ? 'All' : s === 'CRITICAL' ? 'Critical' : 'Warning'}
          </button>
        ))}
        <div style={{ width: 1, height: 16, background: 'var(--border)', margin: '0 0.5rem' }} />
        <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600, marginRight: 4 }}>Group</span>
        {(['all', ...GROUPS] as const).map(g => (
          <button key={g} style={chipStyle(groupFilter === g)} onClick={() => setGroupFilter(g)}>
            {g === 'all' ? 'All' : g}
          </button>
        ))}
      </div>

      {/* Device alerts table */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8 }}>
        <div style={{ padding: '0.9rem 1.25rem', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
            Device Alerts
          </h3>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>
            {filteredAlerts.length} alert{filteredAlerts.length !== 1 ? 's' : ''}
          </span>
        </div>

        {filteredAlerts.length === 0 ? (
          <p style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
            No active alerts across the fleet.
          </p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['Severity', 'Device', 'Group', 'Class', 'Object', 'Message', 'Posted (Baghdad)'].map(h => (
                    <th key={h} style={{
                      textAlign: 'left', padding: '0.5rem 1rem',
                      color: 'var(--muted)', fontWeight: 600, fontSize: 11,
                      whiteSpace: 'nowrap',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredAlerts.map(a => (
                  <tr key={a.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '0.6rem 1rem', whiteSpace: 'nowrap' }}>
                      <span style={{
                        color: SEV_COLOR[a.severity] ?? 'var(--muted)',
                        fontWeight: 700, fontSize: 11,
                      }}>{a.severity}</span>
                    </td>
                    <td style={{ padding: '0.6rem 1rem', whiteSpace: 'nowrap' }}>
                      {a.device_id ? (
                        <Link href={`/devices/${a.device_id}`} style={{
                          color: 'var(--accent-text)', textDecoration: 'none',
                          fontFamily: 'monospace', fontSize: 12,
                        }}>
                          {a.device_display_name ?? a.device_hostname}
                        </Link>
                      ) : (
                        <span style={{ fontFamily: 'monospace' }}>{a.device_hostname}</span>
                      )}
                    </td>
                    <td style={{ padding: '0.6rem 1rem', color: 'var(--muted)' }}>
                      {a.device_group ?? '—'}
                    </td>
                    <td style={{ padding: '0.6rem 1rem', color: 'var(--muted)' }}>{a.class}</td>
                    <td style={{ padding: '0.6rem 1rem', color: 'var(--text-primary)', fontFamily: 'monospace', fontSize: 11 }}>{a.object}</td>
                    <td style={{ padding: '0.6rem 1rem', color: 'var(--text-primary)', maxWidth: 380 }}>
                      <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {a.message}
                      </span>
                    </td>
                    <td style={{ padding: '0.6rem 1rem', color: 'var(--muted)', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                      {formatBaghdad(a.posted_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* System notifications section */}
      {filteredNotifs.length > 0 && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8 }}>
          <div style={{ padding: '0.9rem 1.25rem', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
              System Notifications (last 7 days)
            </h3>
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>
              {filteredNotifs.length} notification{filteredNotifs.length !== 1 ? 's' : ''}
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {filteredNotifs.map(n => (
              <div key={n.id} style={{
                display: 'flex', alignItems: 'flex-start', gap: '0.75rem',
                padding: '0.75rem 1.25rem', borderBottom: '1px solid var(--border)',
              }}>
                <span style={{
                  width: 8, height: 8, borderRadius: '50%', flexShrink: 0, marginTop: 3,
                  background: SEV_COLOR[n.severity] ?? 'var(--muted)',
                }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{n.title}</span>
                    {n.device_id && (
                      <Link href={`/devices/${n.device_id}`} style={{ fontSize: 12, color: 'var(--accent-text)', textDecoration: 'none' }}>
                        {n.device_display_name ?? n.device_hostname}
                      </Link>
                    )}
                    {n.device_group && (
                      <span style={{ fontSize: 11, color: 'var(--muted)' }}>{n.device_group}</span>
                    )}
                    <span style={{ fontSize: 11, color: 'var(--muted)', marginLeft: 'auto', fontVariantNumeric: 'tabular-nums' }}>
                      {formatBaghdad(n.created_at)}
                    </span>
                  </div>
                  <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: '0.15rem' }}>{n.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
