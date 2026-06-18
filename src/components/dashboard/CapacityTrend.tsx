interface Point { date: string; tib: number }

export function CapacityTrend({ data }: { data: Point[] }) {
  if (data.length === 0) {
    return (
      <div style={cardStyle}>
        <h3 style={titleStyle}>Fleet Capacity Trend</h3>
        <p style={{ color: 'var(--muted)', fontSize: 13, paddingTop: '2rem', textAlign: 'center' }}>
          Waiting for the first report from the fleet
        </p>
      </div>
    );
  }

  const W = 400, H = 120, padX = 32, padY = 12;
  const cW = W - padX * 2, cH = H - padY * 2;

  const minV = Math.min(...data.map(d => d.tib));
  const maxV = Math.max(...data.map(d => d.tib)) || 1;
  const range = maxV - minV || 1;

  const toX = (i: number) =>
    padX + (data.length === 1 ? cW / 2 : (i / (data.length - 1)) * cW);
  const toY = (v: number) => padY + cH - ((v - minV) / range) * cH;

  const pts = data.map((d, i) => `${toX(i).toFixed(1)},${toY(d.tib).toFixed(1)}`).join(' ');
  const area = [
    `M ${toX(0).toFixed(1)},${(padY + cH).toFixed(1)}`,
    ...data.map((d, i) => `L ${toX(i).toFixed(1)},${toY(d.tib).toFixed(1)}`),
    `L ${toX(data.length - 1).toFixed(1)},${(padY + cH).toFixed(1)} Z`,
  ].join(' ');

  const lastPoint = data[data.length - 1];

  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.75rem' }}>
        <h3 style={titleStyle}>Fleet Capacity Trend</h3>
        {lastPoint && (
          <span style={{ fontSize: 12, color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>
            Latest: {lastPoint.tib.toFixed(2)} TiB
          </span>
        )}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', overflow: 'visible' }}>
        {/* Grid lines */}
        {[0, 0.5, 1].map(f => {
          const y = padY + cH * (1 - f);
          const v = (minV + range * f).toFixed(1);
          return (
            <g key={f}>
              <line x1={padX} y1={y} x2={padX + cW} y2={y} stroke="var(--border)" strokeWidth={0.5} />
              <text x={padX - 4} y={y + 4} fontSize={8} fill="var(--muted)" textAnchor="end">{v}</text>
            </g>
          );
        })}
        {/* Area fill */}
        <path d={area} fill="rgba(124,58,237,0.08)" />
        {/* Line */}
        <polyline points={pts} fill="none" stroke="var(--accent-text)" strokeWidth={1.5} strokeLinejoin="round" />
        {/* Dots + x-labels */}
        {data.map((d, i) => (
          <g key={d.date}>
            <circle cx={toX(i)} cy={toY(d.tib)} r={3} fill="var(--accent-text)" />
            <text x={toX(i)} y={padY + cH + 14} fontSize={8} fill="var(--muted)" textAnchor="middle">
              {d.date.slice(5)}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

const cardStyle: React.CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  padding: '1rem 1.25rem',
};
const titleStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  color: 'var(--text-primary)',
  margin: 0,
};
