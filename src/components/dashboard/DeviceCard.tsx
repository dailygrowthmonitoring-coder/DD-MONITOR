import Link from 'next/link';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { CapacityBar }  from '@/components/ui/CapacityBar';
import { Sparkline }    from '@/components/ui/Sparkline';
import type { FleetDevice } from '@/lib/db/queries';
import { todayBaghdad } from '@/lib/db/queries';

interface Props {
  fd:        FleetDevice;
  isAdmin:   boolean;
}

export function DeviceCard({ fd, isAdmin }: Props) {
  const { device, postComp, last7Comp, status, sparkline } = fd;
  const today = todayBaghdad();

  const runway = (postComp?.avail_gib && last7Comp?.postcomp_gib && Number(last7Comp.postcomp_gib) > 0)
    ? Math.floor(Number(postComp.avail_gib) / (Number(last7Comp.postcomp_gib) / 7))
    : null;

  const runwayColor = runway === null ? 'var(--muted)'
    : runway < 60 ? 'var(--crit)' : 'var(--ok)';

  const reportTime = device.latest_generated_at
    ? new Intl.DateTimeFormat('en-GB', {
        timeZone: device.time_zone ?? 'Asia/Baghdad',
        hour: '2-digit', minute: '2-digit', hour12: false,
      }).format(new Date(device.latest_generated_at))
    : null;

  const missed = device.latest_report_date !== today;

  const cardBorder = status.status === 'RED'
    ? '1px solid rgba(248,113,113,0.35)'
    : '1px solid var(--border)';

  return (
    <Link
      href={`/devices/${device.id}`}
      style={{ textDecoration: 'none', display: 'block' }}
    >
      <div style={{
        background: 'var(--surface)',
        border: cardBorder,
        borderRadius: 8,
        padding: '1rem',
        cursor: 'pointer',
        transition: 'border-color 0.15s',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
          <div>
            <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 700, fontSize: 14, color: 'var(--text-primary)', fontFamily: 'monospace' }}>
              {device.display_name ?? device.hostname}
            </span>
            {isAdmin && device.device_group === null && (
              <span style={{
                marginLeft: 6,
                fontSize: 10,
                color: 'var(--warn)',
                border: '1px solid var(--warn)',
                borderRadius: 3,
                padding: '1px 4px',
                fontWeight: 600,
              }}>UNCLASSIFIED</span>
            )}
          </div>
          <StatusBadge status={status.status} label={status.label} />
        </div>

        {/* Sub-line */}
        <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: '0.75rem' }}>
          {[device.location, device.model_no, device.os_version].filter(Boolean).join(' · ')}
        </p>

        {/* Capacity */}
        {postComp ? (
          <div style={{ marginBottom: '0.75rem' }}>
            <p style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4, fontWeight: 500 }}>CAPACITY</p>
            <CapacityBar
              pct={Number(postComp.use_pct ?? 0)}
              usedGib={Number(postComp.used_gib)}
              sizeGib={Number(postComp.size_gib ?? 0)}
            />
          </div>
        ) : (
          <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: '0.75rem' }}>No capacity data</p>
        )}

        {/* 7d growth sparkline */}
        {sparkline.length > 0 && (
          <div style={{ marginBottom: '0.75rem' }}>
            <p style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 2, fontWeight: 500 }}>7D GROWTH</p>
            <Sparkline values={sparkline.map(s => s.usedGib)} width={120} height={22} />
          </div>
        )}

        {/* Footer 3-up */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.4rem', marginTop: '0.5rem' }}>
          <FooterStat
            label="COMP 7D"
            value={last7Comp ? `${Number(last7Comp.total_comp_factor).toFixed(1)}×` : '—'}
          />
          <FooterStat
            label="RUNWAY"
            value={runway !== null ? `${runway}d` : '—'}
            color={runwayColor}
          />
          <FooterStat
            label="REPORT"
            value={reportTime ?? '—'}
            color={missed ? 'var(--warn)' : 'var(--text-primary)'}
          />
        </div>
      </div>
    </Link>
  );
}

function FooterStat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <p style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600, marginBottom: 2 }}>{label}</p>
      <p style={{ fontSize: 13, fontVariantNumeric: 'tabular-nums', fontWeight: 600, color: color ?? 'var(--text-primary)' }}>{value}</p>
    </div>
  );
}
