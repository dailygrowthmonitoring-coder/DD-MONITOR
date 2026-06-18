import { Sparkline } from '@/components/ui/Sparkline';

interface KpiCardProps {
  label:     string;
  value:     string | number;
  sub?:      string;
  subColor?: string;
  sparkline?: number[];
  accent?:   boolean;
}

export function KpiCard({ label, value, sub, subColor, sparkline, accent }: KpiCardProps) {
  return (
    <div style={{
      background: 'var(--surface)',
      border: `1px solid ${accent ? 'var(--border-2)' : 'var(--border)'}`,
      borderRadius: 8,
      padding: '1rem 1.25rem',
      display: 'flex',
      alignItems: 'flex-start',
      gap: '0.75rem',
      minWidth: 0,
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 500, marginBottom: '0.4rem' }}>
          {label}
        </p>
        <p style={{
          fontSize: 28,
          fontWeight: 700,
          fontVariantNumeric: 'tabular-nums',
          color: 'var(--text-primary)',
          lineHeight: 1,
          marginBottom: sub ? '0.35rem' : 0,
        }}>{value}</p>
        {sub && (
          <p style={{ fontSize: 12, color: subColor ?? 'var(--muted)' }}>{sub}</p>
        )}
      </div>
      {sparkline && sparkline.length > 0 && (
        <Sparkline values={sparkline} width={64} height={32} />
      )}
    </div>
  );
}
