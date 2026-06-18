'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ServerCog, Eye, EyeOff } from 'lucide-react';
import { ThemeToggle } from '@/components/ui/ThemeToggle';

// ─── Left panel: abstract animated wave visual ────────────────────────────────

function LoginVisual() {
  return (
    <div style={{
      position:   'relative',
      width:      '100%',
      height:     '100%',
      overflow:   'hidden',
      background: 'linear-gradient(160deg, #0D0D14 0%, #09090B 60%, #110A1F 100%)',
    }}>
      {/* Subtle grid */}
      <div style={{
        position:        'absolute',
        inset:           0,
        backgroundImage: [
          'repeating-linear-gradient(0deg, transparent, transparent 47px, rgba(124,58,237,0.05) 48px)',
          'repeating-linear-gradient(90deg, transparent, transparent 47px, rgba(124,58,237,0.05) 48px)',
        ].join(', '),
      }} />

      {/* Pulsing radial glow */}
      <div style={{
        position:   'absolute',
        inset:      0,
        background: 'radial-gradient(ellipse 65% 45% at 50% 62%, rgba(124,58,237,0.18) 0%, transparent 70%)',
        animation:  'dd-breathe 5s ease-in-out infinite',
      }} />

      {/* SVG wave layers */}
      <svg
        viewBox="0 0 1200 500"
        preserveAspectRatio="xMidYMid slice"
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="wg1" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#7C3AED" stopOpacity="0.45" />
            <stop offset="100%" stopColor="#7C3AED" stopOpacity="0.02" />
          </linearGradient>
          <linearGradient id="wg2" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#A78BFA" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#A78BFA" stopOpacity="0.01" />
          </linearGradient>
        </defs>

        {/* Back fill */}
        <path
          d="M0,290 C150,240 300,320 500,270 C680,220 850,310 1000,260 C1100,230 1150,250 1200,260 L1200,500 L0,500 Z"
          fill="url(#wg2)"
          style={{ animation: 'dd-wave-b 8s ease-in-out infinite' }}
        />

        {/* Main fill */}
        <path
          d="M0,310 C180,260 350,340 550,285 C720,235 880,330 1050,275 C1130,248 1170,258 1200,270 L1200,500 L0,500 Z"
          fill="url(#wg1)"
          style={{ animation: 'dd-wave-a 6s ease-in-out infinite' }}
        />

        {/* Wave line */}
        <path
          d="M0,310 C180,260 350,340 550,285 C720,235 880,330 1050,275 C1130,248 1170,258 1200,270"
          fill="none"
          stroke="#A78BFA"
          strokeWidth="1.5"
          strokeOpacity="0.55"
          style={{ animation: 'dd-wave-a 6s ease-in-out infinite' }}
        />

        {/* Secondary wave line */}
        <path
          d="M0,290 C150,240 300,320 500,270 C680,220 850,310 1000,260 C1100,230 1150,250 1200,260"
          fill="none"
          stroke="#7C3AED"
          strokeWidth="1"
          strokeOpacity="0.35"
          style={{ animation: 'dd-wave-b 8s ease-in-out infinite' }}
        />
      </svg>

      {/* Panel content */}
      <div style={{
        position:       'absolute',
        inset:          0,
        display:        'flex',
        flexDirection:  'column',
        alignItems:     'flex-start',
        justifyContent: 'flex-end',
        padding:        '2.5rem',
        zIndex:         10,
      }}>
        {/* Brand icon */}
        <div style={{
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'center',
          width:          44,
          height:         44,
          background:     'linear-gradient(135deg, #7C3AED, #A78BFA)',
          borderRadius:   10,
          marginBottom:   '1.25rem',
          boxShadow:      '0 0 24px rgba(124,58,237,0.5)',
          animation:      'dd-pulse-ring 4s ease-in-out infinite',
        }}>
          <ServerCog size={22} color="#fff" />
        </div>

        <h2 style={{
          fontSize:      '1.5rem',
          fontWeight:    700,
          color:         '#FAFAFA',
          lineHeight:    1.2,
          margin:        '0 0 0.35rem',
          letterSpacing: '-0.02em',
        }}>
          Backup infrastructure
        </h2>
        <p style={{
          fontSize:   '0.875rem',
          color:      'rgba(167,139,250,0.8)',
          fontFamily: 'monospace',
          letterSpacing: '0.04em',
        }}>
          monitored continuously.
        </p>
      </div>
    </div>
  );
}

// ─── Main login page ──────────────────────────────────────────────────────────

export default function LoginPage() {
  const [email,       setEmail]       = useState('');
  const [password,    setPassword]    = useState('');
  const [showPw,      setShowPw]      = useState(false);
  const [error,       setError]       = useState('');
  const [loading,     setLoading]     = useState(false);
  const router = useRouter();

  // Keep body background synced for the split-screen effect
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res  = await fetch('/api/auth/step1', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email, password }),
      });
      const data = await res.json();

      if (!data.ok) {
        setError(data.error?.message ?? 'Sign-in failed. Please try again.');
        return;
      }

      // Credentials valid + 2FA code sent — move to verification step
      router.push('/login/verify');
    } catch {
      setError('Network error. Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      display:       'flex',
      height:        '100vh',
      width:         '100vw',
      overflow:      'hidden',
    }}>

      {/* ── Left visual panel (hidden on small screens) ── */}
      <div style={{
        flex:             '0 0 58%',
        display:          'flex',
        position:         'relative',
      }} className="login-visual-panel">
        <style>{`
          @media (max-width: 768px) { .login-visual-panel { display: none !important; } }
        `}</style>
        <LoginVisual />
      </div>

      {/* ── Right form panel ── */}
      <div style={{
        flex:           '1 1 42%',
        display:        'flex',
        flexDirection:  'column',
        background:     'var(--surface)',
        overflowY:      'auto',
        position:       'relative',
        borderLeft:     '1px solid var(--border)',
      }}>
        {/* Theme toggle — top-right */}
        <div style={{
          position:       'absolute',
          top:            '1rem',
          right:          '1rem',
          zIndex:         20,
        }}>
          <ThemeToggle size={15} />
        </div>

        {/* Form wrapper — vertically centred */}
        <div style={{
          flex:           1,
          display:        'flex',
          flexDirection:  'column',
          justifyContent: 'center',
          padding:        'clamp(2rem, 6vw, 3.5rem)',
          maxWidth:       440,
          margin:         '0 auto',
          width:          '100%',
        }}>

          {/* Brand mark */}
          <div style={{ marginBottom: '2.25rem' }}>
            <div style={{
              display:        'inline-flex',
              alignItems:     'center',
              justifyContent: 'center',
              width:          42,
              height:         42,
              background:     'linear-gradient(135deg, #7C3AED, #A78BFA)',
              borderRadius:   10,
              marginBottom:   '0.85rem',
              boxShadow:      '0 4px 16px rgba(124,58,237,0.35)',
            }}>
              <ServerCog size={20} color="#fff" />
            </div>
            <h1 style={{
              fontSize:      '1rem',
              fontWeight:    700,
              color:         'var(--text-primary)',
              margin:        '0 0 0.15rem',
              letterSpacing: '-0.01em',
            }}>
              DD Monitor
            </h1>
            <p style={{ fontSize: 12, color: 'var(--muted)', fontFamily: 'monospace', letterSpacing: '0.03em' }}>
              Zain Iraq · Backup infrastructure
            </p>
          </div>

          {/* Heading */}
          <div style={{ marginBottom: '1.75rem' }}>
            <h2 style={{
              fontSize:      '1.5rem',
              fontWeight:    700,
              color:         'var(--text-primary)',
              margin:        '0 0 0.3rem',
              letterSpacing: '-0.02em',
            }}>
              Welcome back
            </h2>
            <p style={{ fontSize: 14, color: 'var(--muted)' }}>
              Sign in to your dashboard
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {/* Email */}
            <label style={labelStyle}>
              <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>Email</span>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoComplete="email"
                placeholder="you@example.com"
                style={inputStyle}
              />
            </label>

            {/* Password with show/hide */}
            <label style={labelStyle}>
              <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>Password</span>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPw ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  placeholder="••••••••••"
                  style={{ ...inputStyle, paddingRight: '2.5rem' }}
                />
                <button
                  type="button"
                  onClick={() => setShowPw(v => !v)}
                  style={{
                    position:  'absolute',
                    right:     '0.65rem',
                    top:       '50%',
                    transform: 'translateY(-50%)',
                    background:'none',
                    border:    'none',
                    cursor:    'pointer',
                    color:     'var(--muted)',
                    display:   'flex',
                    alignItems:'center',
                    padding:   0,
                  }}
                  aria-label={showPw ? 'Hide password' : 'Show password'}
                >
                  {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </label>

            {/* Inline error */}
            {error && (
              <p style={{
                fontSize:  13,
                color:     'var(--crit)',
                padding:   '0.55rem 0.75rem',
                background:'rgba(220,38,38,0.07)',
                border:    '1px solid rgba(220,38,38,0.2)',
                borderRadius: 6,
                margin:    0,
              }}>
                {error}
              </p>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              style={{
                marginTop:    '0.25rem',
                width:        '100%',
                padding:      '0.7rem 1rem',
                background:   loading
                  ? 'var(--muted)'
                  : 'linear-gradient(135deg, #7C3AED 0%, #6D28D9 100%)',
                color:        '#fff',
                border:       'none',
                borderRadius: 8,
                fontSize:     14,
                fontWeight:   700,
                cursor:       loading ? 'not-allowed' : 'pointer',
                letterSpacing:'0.02em',
                opacity:      loading ? 0.65 : 1,
                transition:   'opacity 0.15s',
                boxShadow:    loading ? 'none' : '0 4px 14px rgba(124,58,237,0.35)',
              }}
            >
              {loading ? 'Verifying…' : 'Sign in to Dashboard'}
            </button>
          </form>

          {/* Status strip */}
          <div style={{
            marginTop:  '1.75rem',
            display:    'flex',
            alignItems: 'center',
            gap:        '1rem',
            padding:    '0.65rem 0.9rem',
            background: 'var(--surface-2)',
            border:     '1px solid var(--border)',
            borderRadius: 8,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <span style={{
                display:      'inline-block',
                width:        7,
                height:       7,
                borderRadius: '50%',
                background:   'var(--ok)',
                boxShadow:    '0 0 6px var(--ok)',
                flexShrink:   0,
              }} />
              <span style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'monospace' }}>
                System online
              </span>
            </div>
            <span style={{ width: 1, height: 12, background: 'var(--border)' }} />
            <span style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'monospace' }}>
              2FA protected
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display:       'flex',
  flexDirection: 'column',
  gap:           '0.4rem',
};

const inputStyle: React.CSSProperties = {
  background:   'var(--surface-2)',
  border:       '1px solid var(--border-2)',
  borderRadius:  7,
  color:        'var(--text-primary)',
  fontSize:      14,
  padding:      '0.6rem 0.85rem',
  outline:       'none',
  width:         '100%',
};
