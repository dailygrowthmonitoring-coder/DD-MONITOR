import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { createSSRClient }        from '@/lib/db/client-ssr';
import { fetchDeviceDetail, fetchDeviceCapHistory, todayBaghdad } from '@/lib/db/queries';
import { computeStatus } from '@/lib/status';
import { StatusBadge }   from '@/components/ui/StatusBadge';
import { DeviceTabs }    from '@/components/device/DeviceTabs';

export const dynamic = 'force-dynamic';

export default async function DeviceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createSSRClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const [detail, capHistory] = await Promise.all([
    fetchDeviceDetail(supabase, id),
    fetchDeviceCapHistory(supabase, id),
  ]);

  if (!detail) notFound();

  const { device, report, capacity, compression, alerts, network, health } = detail;

  // Derive KPI metrics
  const postComp  = capacity.find(c => c.tier === 'active' && c.resource.includes('post-comp')) ?? null;
  const last7Comp = compression.find(c => c.period === 'last_7_days') ?? null;
  const activeAlerts = alerts.filter(a => a.is_active);
  const today     = todayBaghdad();

  const usePct    = postComp?.use_pct   !== null && postComp?.use_pct   !== undefined ? Number(postComp.use_pct)   : undefined;
  const runway    = (postComp?.avail_gib && last7Comp?.postcomp_gib && Number(last7Comp.postcomp_gib) > 0)
    ? Number(postComp.avail_gib) / (Number(last7Comp.postcomp_gib) / 7)
    : undefined;
  const compFactor7d = last7Comp?.total_comp_factor !== undefined ? Number(last7Comp.total_comp_factor) : undefined;

  const swapPct = (health?.swap_total_mib && Number(health.swap_total_mib) > 0)
    ? ((Number(health.swap_total_mib) - Number(health.swap_free_mib ?? 0)) / Number(health.swap_total_mib)) * 100
    : undefined;

  const reportIsStale = !!report && report.report_date !== today;

  const statusResult = computeStatus({
    hasReportToday:    report?.report_date === today,
    usePct,
    hasCriticalAlert:  activeAlerts.some(a => a.severity === 'CRITICAL'),
    hasWarningAlert:   activeAlerts.some(a => a.severity === 'WARNING'),
    hasInterfaceFault: network.some(n => n.state === 'fault'),
    runwayDays:        runway,
    swapUsedPct:       swapPct,
  });

  // On the detail page, show the device's actual health even when the report is stale.
  // The fleet card correctly shows GRAY/NO REPORT; the detail header surfaces real severity.
  const healthMetrics = {
    usePct,
    hasCriticalAlert:  activeAlerts.some(a => a.severity === 'CRITICAL'),
    hasWarningAlert:   activeAlerts.some(a => a.severity === 'WARNING'),
    hasInterfaceFault: network.some(n => n.state === 'fault'),
    runwayDays:        runway,
    swapUsedPct:       swapPct,
  };
  const headerStatusResult = (report !== null && reportIsStale)
    ? computeStatus({ hasReportToday: true, ...healthMetrics })
    : statusResult;

  // Header subtitle
  const subtitleParts: string[] = [];
  if (device.location)   subtitleParts.push(device.location);
  if (device.os_version) subtitleParts.push(`DD OS ${device.os_version}`);
  if (health?.uptime_days !== null && health?.uptime_days !== undefined) {
    subtitleParts.push(`uptime ${Math.floor(Number(health.uptime_days))}d`);
  }

  const kpis = [
    {
      label: 'Capacity',
      value: usePct !== undefined ? `${Math.round(usePct)}%` : '—',
      color: usePct !== undefined && usePct >= 90 ? 'var(--crit)' : usePct !== undefined && usePct >= 80 ? 'var(--warn)' : undefined,
    },
    {
      label: 'Est. Runway',
      value: runway !== undefined ? `${Math.round(runway)}d` : '—',
      color: runway !== undefined && runway < 60 ? 'var(--crit)' : undefined,
    },
    {
      label: 'Comp Factor 7d',
      value: compFactor7d !== undefined ? `${compFactor7d.toFixed(1)}×` : '—',
    },
    {
      label: 'Active Alerts',
      value: String(activeAlerts.length),
      color: activeAlerts.some(a => a.severity === 'CRITICAL') ? 'var(--crit)'
           : activeAlerts.some(a => a.severity === 'WARNING')  ? 'var(--warn)'
           : activeAlerts.length > 0                           ? 'var(--accent)'
           : undefined,
    },
  ];

  return (
    <div style={{ maxWidth: 1280, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: '1.25rem' }}>
        <Link
          href="/"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: '0.25rem',
            fontSize: 13, color: 'var(--muted)', textDecoration: 'none',
            marginBottom: '0.75rem',
          }}
        >
          <ChevronLeft size={14} /> Overview
        </Link>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <h1 style={{
            fontSize: 22, fontWeight: 700, fontFamily: 'monospace',
            color: 'var(--text-primary)', margin: 0,
          }}>
            {device.display_name ?? device.hostname}
          </h1>
          <StatusBadge status={headerStatusResult.status} label={headerStatusResult.label} />
          {reportIsStale && (
            <span style={{
              fontSize: 11, color: 'var(--warn)',
              background: 'rgba(251,191,36,0.08)',
              border: '1px solid rgba(251,191,36,0.25)',
              borderRadius: 4, padding: '2px 6px', fontWeight: 500,
            }}>
              stale — last report {report!.report_date}
            </span>
          )}
        </div>

        {subtitleParts.length > 0 && (
          <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: '0.25rem' }}>
            {subtitleParts.join(' · ')}
          </p>
        )}

        {report && !reportIsStale && (
          <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: '0.2rem' }}>
            Last report: {report.report_date}
          </p>
        )}
      </div>

      {/* 4-KPI strip */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: '0.75rem',
        marginBottom: '1.5rem',
      }}>
        {kpis.map(kpi => (
          <div key={kpi.label} style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            padding: '0.9rem 1.1rem',
          }}>
            <p style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: '0.25rem' }}>
              {kpi.label}
            </p>
            <p style={{
              fontSize: 24, fontWeight: 700, fontFamily: 'monospace',
              color: kpi.color ?? 'var(--text-primary)', margin: 0,
            }}>
              {kpi.value}
            </p>
          </div>
        ))}
      </div>

      {/* Tab detail */}
      <div style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 8,
        padding: '1rem 1.25rem',
      }}>
        <DeviceTabs detail={detail} capHistory={capHistory} />
      </div>
    </div>
  );
}
