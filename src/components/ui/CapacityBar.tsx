interface CapacityBarProps {
  pct: number;     // 0–100
  usedGib?: number;
  sizeGib?: number;
}

function barColor(pct: number) {
  if (pct >= 90) return 'var(--crit)';
  if (pct >= 80) return 'var(--warn)';
  return 'var(--ok)';
}

export function CapacityBar({ pct, usedGib, sizeGib }: CapacityBarProps) {
  const clamped = Math.min(100, Math.max(0, pct));
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 12 }}>
        {usedGib !== undefined && sizeGib !== undefined ? (
          <>
            <span style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--text-primary)' }}>
              {usedGib.toLocaleString(undefined, { maximumFractionDigits: 0 })} GiB
            </span>
            <span style={{ color: 'var(--muted)' }}>
              / {sizeGib.toLocaleString(undefined, { maximumFractionDigits: 0 })} GiB
            </span>
          </>
        ) : null}
        <span style={{ color: barColor(clamped), fontVariantNumeric: 'tabular-nums', marginLeft: 'auto' }}>
          {Math.round(clamped)}%
        </span>
      </div>
      <div style={{
        height: 4,
        background: 'var(--border-2)',
        borderRadius: 2,
        overflow: 'hidden',
      }}>
        <div style={{
          width: `${clamped}%`,
          height: '100%',
          background: barColor(clamped),
          borderRadius: 2,
          transition: 'width 0.3s',
        }} />
      </div>
    </div>
  );
}
