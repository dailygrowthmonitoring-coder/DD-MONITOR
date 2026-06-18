import { BaghdadClock } from './BaghdadClock';

interface TopbarProps {
  userInitials: string;
  userRole:     string;
}

export function Topbar({ userInitials, userRole }: TopbarProps) {
  return (
    <header style={{
      position:     'fixed',
      top:          0,
      left:         'var(--sidebar-w, 56px)',
      right:        0,
      height:       52,
      background:   'var(--surface)',
      borderBottom: '1px solid var(--border)',
      display:      'flex',
      alignItems:   'center',
      padding:      '0 1.25rem',
      gap:          '1rem',
      zIndex:       30,
      transition:   'left 0.2s ease',
    }}>
      {/* Wordmark */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
        <span style={{ fontWeight: 700, fontSize: 14, letterSpacing: 1, color: 'var(--text-primary)' }}>
          DD MONITOR
        </span>
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>Zain Iraq · Backup infrastructure</span>
        <span style={{
          marginLeft:    4,
          fontSize:      10,
          fontWeight:    700,
          letterSpacing: 0.5,
          color:         'var(--ok)',
          border:        '1px solid var(--ok)',
          borderRadius:  3,
          padding:       '1px 5px',
        }}>PRODUCTION</span>
      </div>

      <div style={{ flex: 1 }} />

      {/* Search placeholder */}
      <input
        placeholder="Search devices…"
        readOnly
        style={{
          background:   'var(--surface-2)',
          border:       '1px solid var(--border)',
          borderRadius: 6,
          color:        'var(--muted)',
          fontSize:     13,
          padding:      '0.3rem 0.65rem',
          width:        180,
          cursor:       'not-allowed',
        }}
      />

      {/* Clock */}
      <BaghdadClock />

      {/* Avatar */}
      <div
        style={{
          width:          30,
          height:         30,
          borderRadius:   '50%',
          background:     'var(--accent)',
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'center',
          fontSize:       11,
          fontWeight:     700,
          color:          '#fff',
          flexShrink:     0,
        }}
        title={userRole}
      >
        {userInitials}
      </div>
    </header>
  );
}
