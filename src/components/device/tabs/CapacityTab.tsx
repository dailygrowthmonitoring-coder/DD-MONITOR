import { CapacityBar } from '@/components/ui/CapacityBar';
import { Sparkline }   from '@/components/ui/Sparkline';
import type { DeviceDetail } from '@/lib/db/queries';

export function CapacityTab({
  detail,
  capHistory,
}: {
  detail: DeviceDetail;
  capHistory: { date: string; usedGib: number }[];
}) {
  const { capacity } = detail;
  if (capacity.length === 0) {
    return <Empty msg="No capacity data in the latest report" />;
  }

  const active = capacity.filter(r => r.tier === 'active');
  const cloud  = capacity.filter(r => r.tier === 'cloud');
  const postComp = active.find(r => r.resource.includes('post-comp'));

  const dailyGrowth = capHistory.length >= 2
    ? (capHistory[capHistory.length - 1].usedGib - capHistory[0].usedGib) / (capHistory.length - 1)
    : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Post-comp highlight + 7d sparkline */}
      {postComp && (
        <div style={sectionStyle}>
          <h4 style={sectionTitle}>Active Tier — /data: post-comp</h4>
          <CapacityBar
            pct={Number(postComp.use_pct ?? 0)}
            usedGib={Number(postComp.used_gib)}
            sizeGib={Number(postComp.size_gib ?? 0)}
          />
          {capHistory.length > 0 && (
            <div style={{ marginTop: '0.75rem' }}>
              <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>Used GiB — last {capHistory.length} {capHistory.length === 1 ? 'day' : 'days'}</p>
              <Sparkline values={capHistory.map(h => h.usedGib)} width={240} height={36} />
            </div>
          )}
        </div>
      )}

      {/* Active tier table */}
      <div style={sectionStyle}>
        <h4 style={sectionTitle}>Active Tier</h4>
        <CapTable rows={active} />
      </div>

      {/* Cloud tier (7.13 devices) */}
      {cloud.length > 0 && (
        <div style={sectionStyle}>
          <h4 style={sectionTitle}>Cloud Tier</h4>
          <CapTable rows={cloud} />
        </div>
      )}

      {/* Summary stats */}
      <div style={sectionStyle}>
        <h4 style={sectionTitle}>Summary</h4>
        <table style={tableStyle}>
          <tbody>
            {postComp?.avail_gib !== null && <StatRow label="Available" value={`${Number(postComp?.avail_gib ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 })} GiB`} />}
            {postComp?.cleanable_gib !== null && postComp?.cleanable_gib !== undefined && (
              <StatRow label="Cleanable" value={`${Number(postComp.cleanable_gib).toLocaleString(undefined, { maximumFractionDigits: 0 })} GiB`} />
            )}
            {dailyGrowth !== null && (
              <StatRow label="Daily growth (7d avg)" value={`${dailyGrowth.toLocaleString(undefined, { maximumFractionDigits: 0 })} GiB/day`} />
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CapTable({ rows }: { rows: { resource: string; used_gib: number; size_gib: number | null; avail_gib: number | null; use_pct: number | null; cleanable_gib: number | null }[] }) {
  return (
    <table style={tableStyle}>
      <thead>
        <tr>
          {['Resource', 'Used GiB', 'Size GiB', 'Avail GiB', 'Use %', 'Cleanable GiB'].map(h => (
            <th key={h} style={thStyle}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map(r => (
          <tr key={r.resource}>
            <td style={tdStyle}>{r.resource}</td>
            <td style={{ ...tdStyle, fontVariantNumeric: 'tabular-nums' }}>{Number(r.used_gib).toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
            <td style={{ ...tdStyle, fontVariantNumeric: 'tabular-nums' }}>{r.size_gib !== null ? Number(r.size_gib).toLocaleString(undefined, { maximumFractionDigits: 0 }) : '—'}</td>
            <td style={{ ...tdStyle, fontVariantNumeric: 'tabular-nums' }}>{r.avail_gib !== null ? Number(r.avail_gib).toLocaleString(undefined, { maximumFractionDigits: 0 }) : '—'}</td>
            <td style={{ ...tdStyle, fontVariantNumeric: 'tabular-nums', color: r.use_pct !== null && Number(r.use_pct) >= 90 ? 'var(--crit)' : r.use_pct !== null && Number(r.use_pct) >= 80 ? 'var(--warn)' : 'var(--text-primary)' }}>{r.use_pct !== null ? `${Math.round(Number(r.use_pct))}%` : '—'}</td>
            <td style={{ ...tdStyle, fontVariantNumeric: 'tabular-nums' }}>{r.cleanable_gib !== null ? Number(r.cleanable_gib).toLocaleString(undefined, { maximumFractionDigits: 0 }) : '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <tr>
      <td style={{ ...tdStyle, color: 'var(--muted)', width: '40%' }}>{label}</td>
      <td style={{ ...tdStyle, fontVariantNumeric: 'tabular-nums' }}>{value}</td>
    </tr>
  );
}

function Empty({ msg }: { msg: string }) {
  return <p style={{ color: 'var(--muted)', fontSize: 13, padding: '2rem 0', textAlign: 'center' }}>{msg}</p>;
}

const sectionStyle: React.CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  padding: '1rem 1.25rem',
};
const sectionTitle: React.CSSProperties = {
  fontSize: 12, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase',
  letterSpacing: 0.5, marginBottom: '0.75rem',
};
const tableStyle: React.CSSProperties = {
  width: '100%', borderCollapse: 'collapse', fontSize: 13,
};
const thStyle: React.CSSProperties = {
  textAlign: 'left', color: 'var(--muted)', fontWeight: 600, fontSize: 11,
  padding: '0.3rem 0.5rem', borderBottom: '1px solid var(--border)',
};
const tdStyle: React.CSSProperties = {
  padding: '0.4rem 0.5rem', color: 'var(--text-primary)',
  borderBottom: '1px solid var(--border)',
};
