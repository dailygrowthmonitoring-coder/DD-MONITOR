import { createSSRClient }    from '@/lib/db/client-ssr';
import {
  fetchFleet,
  fetchFleetTrend,
  fetchActiveAlerts,
  fetchNotifications,
  todayBaghdad,
} from '@/lib/db/queries';
import type { DeviceGroup } from '@/lib/db/types';
import { KpiCard }            from '@/components/dashboard/KpiCard';
import { DeviceCard }         from '@/components/dashboard/DeviceCard';
import { CapacityTrend }      from '@/components/dashboard/CapacityTrend';
import { ActiveAlertsPanel }  from '@/components/dashboard/ActiveAlertsPanel';
import { NotificationsStrip } from '@/components/dashboard/NotificationsStrip';
import { StatusBadge }        from '@/components/ui/StatusBadge';

interface Props {
  group?: DeviceGroup;
}

/**
 * Shared overview component for All Fleet (/) and per-group (/g/[group]) views.
 * One component, one data-fetch path — group param narrows the data.
 */
export async function FleetOverview({ group }: Props) {
  const supabase = await createSSRClient();

  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = user
    ? await supabase.from('profiles').select('role').eq('user_id', user.id).single()
    : { data: null };
  const isAdmin = profile?.role === 'admin';

  const today = todayBaghdad();

  const [{ devices }, trend, rawAlerts, notifications] = await Promise.all([
    fetchFleet(supabase, group),
    fetchFleetTrend(supabase, group),
    fetchActiveAlerts(supabase, group),
    fetchNotifications(supabase),
  ]);

  // Derive KPIs directly from the (already group-scoped) devices list
  const activeDevices  = devices.filter(d => d.device.is_active).length;
  const reportsToday   = devices.filter(d => d.device.latest_report_date === today).length;
  const missing        = activeDevices - reportsToday;
  const critical       = devices.filter(d => d.status.status === 'RED').length;
  const validUsePcts   = devices
    .filter(d => d.postComp?.use_pct !== null && d.postComp?.use_pct !== undefined)
    .map(d => Number(d.postComp!.use_pct));
  const avgUsePct      = validUsePcts.length > 0
    ? validUsePcts.reduce((s, v) => s + v, 0) / validUsePcts.length
    : null;

  const fleetSparkline = trend.map(t => t.tib);

  const groupLabel = group ? ` — ${group}` : '';

  return (
    <div style={{ maxWidth: 1280, margin: '0 auto' }}>
      {/* KPI row */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: '0.75rem',
        marginBottom: '1.5rem',
      }}>
        <KpiCard
          label="Devices online"
          value={activeDevices}
          sub={activeDevices === 0 ? `No devices${group ? ` in ${group}` : ''}` : undefined}
          sparkline={[activeDevices]}
        />
        <KpiCard
          label="Reports today"
          value={`${reportsToday} / ${activeDevices}`}
          sub={missing > 0 ? `${missing} missing` : 'All received'}
          subColor={missing > 0 ? 'var(--warn)' : 'var(--ok)'}
        />
        <KpiCard
          label="Critical alerts"
          value={critical}
          sub={critical > 0 ? 'Devices RED' : 'Fleet healthy'}
          subColor={critical > 0 ? 'var(--crit)' : 'var(--ok)'}
        />
        <KpiCard
          label={`Capacity${groupLabel}`}
          value={avgUsePct !== null ? `${Math.round(avgUsePct)}%` : '—'}
          sub="Avg post-comp used"
          sparkline={fleetSparkline}
        />
      </div>

      {/* Fleet status legend */}
      <div style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
          {group ? `${group} Status` : 'Fleet Status'}
        </span>
        {(['GREEN', 'AMBER', 'RED', 'GRAY'] as const).map(s => (
          <StatusBadge key={s} status={s} label={
            s === 'GREEN' ? 'HEALTHY'  :
            s === 'AMBER' ? 'WARNING'  :
            s === 'RED'   ? 'CRITICAL' : 'NO REPORT'
          } />
        ))}
        <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--muted)' }}>
          {today} · Asia/Baghdad
        </span>
      </div>

      {/* Device grid */}
      {devices.length === 0 ? (
        <div style={{
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 8, padding: '3rem', textAlign: 'center',
          color: 'var(--muted)', marginBottom: '1.5rem',
        }}>
          <p style={{ fontSize: 14, fontWeight: 500 }}>
            {group
              ? `No devices classified as ${group} yet`
              : 'No devices registered yet'}
          </p>
          <p style={{ fontSize: 13, marginTop: '0.5rem' }}>
            {group
              ? 'Assign devices in Settings → Device Classification.'
              : 'Ingest the first report to auto-register a device.'}
          </p>
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
          gap: '0.75rem',
          marginBottom: '1.5rem',
        }}>
          {devices.map(fd => (
            <DeviceCard key={fd.device.id} fd={fd} isAdmin={isAdmin} />
          ))}
        </div>
      )}

      {/* Trend + alerts panels */}
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr',
        gap: '0.75rem', marginBottom: '1rem',
      }}>
        <CapacityTrend data={trend} />
        <ActiveAlertsPanel alerts={rawAlerts as Parameters<typeof ActiveAlertsPanel>[0]['alerts']} />
      </div>

      {/* Notifications strip (fleet-wide) */}
      <NotificationsStrip notifications={notifications} />
    </div>
  );
}
