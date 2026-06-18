import type { DeviceDetail } from '@/lib/db/queries';

export function HealthTab({ detail }: { detail: DeviceDetail }) {
  const { health, disk, device } = detail;

  if (!health && !disk) {
    return <Empty msg="No system health data in the latest report" />;
  }

  const memTotalGib = health?.mem_total_mib !== null && health?.mem_total_mib !== undefined
    ? Number(health.mem_total_mib) / 1024 : null;
  const memFreeGib  = health?.mem_free_mib  !== null && health?.mem_free_mib  !== undefined
    ? Number(health.mem_free_mib)  / 1024 : null;

  const swapPct = (health?.swap_total_mib && Number(health.swap_total_mib) > 0)
    ? ((Number(health.swap_total_mib) - Number(health.swap_free_mib ?? 0)) / Number(health.swap_total_mib)) * 100
    : null;

  const healthRows: { label: string; value: string; color?: string }[] = [
    health?.uptime_days !== null && health?.uptime_days !== undefined
      ? { label: 'Uptime', value: `${Number(health.uptime_days).toLocaleString(undefined, { maximumFractionDigits: 0 })} days` }
      : null,
    (memFreeGib !== null && memTotalGib !== null)
      ? {
          label: 'Memory free / total',
          value: `${memFreeGib.toLocaleString(undefined, { maximumFractionDigits: 1 })} / ${memTotalGib.toLocaleString(undefined, { maximumFractionDigits: 1 })} GiB`,
        }
      : null,
    swapPct !== null
      ? { label: 'Swap used', value: `${Math.round(swapPct)}%`, color: swapPct >= 95 ? 'var(--crit)' : undefined }
      : null,
    health?.system_availability_pct !== null && health?.system_availability_pct !== undefined
      ? { label: 'System availability', value: `${Number(health.system_availability_pct).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%` }
      : null,
    health?.fs_availability_pct !== null && health?.fs_availability_pct !== undefined
      ? { label: 'FS availability', value: `${Number(health.fs_availability_pct).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%` }
      : null,
    device.os_version
      ? { label: 'OS version', value: device.os_version }
      : null,
    (health?.load_avg_1m !== null && health?.load_avg_1m !== undefined)
      ? { label: 'Load avg (1m / 5m / 15m)', value: `${Number(health.load_avg_1m).toFixed(2)} / ${Number(health.load_avg_5m ?? 0).toFixed(2)} / ${Number(health.load_avg_15m ?? 0).toFixed(2)}` }
      : null,
  ].filter(Boolean) as { label: string; value: string; color?: string }[];

  const diskRows: { label: string; value: string; color?: string }[] = disk ? [
    { label: 'Disks in use',  value: String(disk.disks_in_use) },
    { label: 'Disks spare',   value: String(disk.disks_spare) },
    { label: 'Disks failed',  value: String(disk.disks_failed), color: disk.disks_failed > 0 ? 'var(--crit)' : undefined },
    { label: 'Disks absent',  value: String(disk.disks_absent) },
  ] : [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {healthRows.length > 0 && (
        <div style={cardStyle}>
          <h4 style={sectionTitle}>System</h4>
          <table style={tableStyle}>
            <tbody>
              {healthRows.map(r => (
                <tr key={r.label}>
                  <td style={{ ...tdStyle, color: 'var(--muted)', width: '45%' }}>{r.label}</td>
                  <td style={{ ...tdStyle, color: r.color ?? 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>{r.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {diskRows.length > 0 && (
        <div style={cardStyle}>
          <h4 style={sectionTitle}>Disks</h4>
          <table style={tableStyle}>
            <tbody>
              {diskRows.map(r => (
                <tr key={r.label}>
                  <td style={{ ...tdStyle, color: 'var(--muted)', width: '45%' }}>{r.label}</td>
                  <td style={{ ...tdStyle, color: r.color ?? 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>{r.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Empty({ msg }: { msg: string }) {
  return <p style={{ color: 'var(--muted)', fontSize: 13, padding: '2rem 0', textAlign: 'center' }}>{msg}</p>;
}

const cardStyle: React.CSSProperties = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '1rem 1.25rem' };
const sectionTitle: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: '0.75rem' };
const tableStyle: React.CSSProperties = { width: '100%', borderCollapse: 'collapse', fontSize: 13 };
const tdStyle: React.CSSProperties = { padding: '0.4rem 0.5rem', borderBottom: '1px solid var(--border)' };
