import type { DeviceStatus, StatusLabel } from '@/lib/status';

const BG: Record<DeviceStatus, string> = {
  GREEN: 'rgba(74,222,128,0.12)',
  AMBER: 'rgba(251,191,36,0.12)',
  RED:   'rgba(248,113,113,0.14)',
  GRAY:  'rgba(82,82,91,0.18)',
};
const FG: Record<DeviceStatus, string> = {
  GREEN: 'var(--ok)',
  AMBER: 'var(--warn)',
  RED:   'var(--crit)',
  GRAY:  'var(--muted)',
};

interface Props {
  status: DeviceStatus;
  label: StatusLabel;
  size?: 'sm' | 'md';
}

export function StatusBadge({ status, label, size = 'sm' }: Props) {
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: '0.3rem',
      background: BG[status],
      color: FG[status],
      borderRadius: 4,
      padding: size === 'md' ? '0.3rem 0.65rem' : '0.15rem 0.45rem',
      fontSize: size === 'md' ? 12 : 11,
      fontWeight: 600,
      letterSpacing: 0.3,
      whiteSpace: 'nowrap',
    }}>
      <span style={{
        width: 6,
        height: 6,
        borderRadius: '50%',
        background: FG[status],
        flexShrink: 0,
      }} />
      {label}
    </span>
  );
}
