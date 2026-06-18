'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ShieldCheck, ServerCog } from 'lucide-react';
import { ThemeToggle } from '@/components/ui/ThemeToggle';

// ─── Constants (unchanged) ────────────────────────────────────────────────────

const CODE_LENGTH = 6;
const CODE_TTL    = Number(process.env.NEXT_PUBLIC_TWO_FACTOR_CODE_TTL_SECONDS ?? 60);

// ─── Main page ────────────────────────────────────────────────────────────────

export default function VerifyPage() {
  // All original 2FA state — not changed
  const [digits,      setDigits]      = useState<string[]>(Array(CODE_LENGTH).fill(''));
  const [error,       setError]       = useState('');
  const [loading,     setLoading]     = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(CODE_TTL);
  const [expired,     setExpired]     = useState(false);
  const [resending,   setResending]   = useState(false);
  const [resendMsg,   setResendMsg]   = useState('');
  const inputRefs = useRef<Array<HTMLInputElement | null>>(Array(CODE_LENGTH).fill(null));
  const router    = useRouter();

  // Animation-only state
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const [shaking,      setShaking]      = useState(false);
  const [succeeded,    setSucceeded]    = useState(false);

  // Checked once on mount — not reactive (fine for a security page)
  const reducedMotion = useRef(
    typeof window !== 'undefined'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false,
  );

  // ── Timer (original logic; halted once succeeded) ──────────────────────────
  useEffect(() => {
    if (succeeded || secondsLeft <= 0) {
      if (!succeeded && secondsLeft <= 0) setExpired(true);
      return;
    }
    const id = setInterval(() => {
      setSecondsLeft(s => {
        if (s <= 1) { setExpired(true); return 0; }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [secondsLeft, succeeded]);

  // ── Redirect after success animation (2 s window for the draw animation) ───
  useEffect(() => {
    if (!succeeded) return;
    const id = setTimeout(() => {
      router.push('/');
      router.refresh();
    }, 2000);
    return () => clearTimeout(id);
  }, [succeeded, router]);

  // ── Server verification — original logic, success now gates the animation ──
  const submitCode = useCallback(async (code: string) => {
    setLoading(true);
    setError('');
    try {
      const res  = await fetch('/api/auth/step2', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ code }),
      });
      const data = await res.json();
      if (data.ok) {
        // Success: show animation, then redirect (in the useEffect above)
        setSucceeded(true);
      } else {
        setError(data.error?.message ?? 'Verification failed.');
        setShaking(true);
        setDigits(Array(CODE_LENGTH).fill(''));
        setTimeout(() => inputRefs.current[0]?.focus(), 50);
      }
    } catch {
      setError('Network error. Please try again.');
      setShaking(true);
    } finally {
      setLoading(false);
    }
  }, []);

  // ── Auto-submit when all 6 digits are filled (unchanged) ──────────────────
  useEffect(() => {
    const code = digits.join('');
    if (code.length === CODE_LENGTH && digits.every(d => d !== '')) {
      submitCode(code);
    }
  }, [digits, submitCode]);

  // ── Input handlers (original logic + digit-pop via Web Animations API) ────
  function handleInput(index: number, value: string) {
    // Full-code paste
    if (value.length === CODE_LENGTH && /^\d{6}$/.test(value)) {
      const next = value.split('');
      setDigits(next);
      inputRefs.current[CODE_LENGTH - 1]?.focus();
      return;
    }
    const digit = value.replace(/\D/g, '').slice(-1);
    const next  = [...digits];
    next[index] = digit;
    setDigits(next);
    if (digit && index < CODE_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    }
    // Digit-pop animation (skipped for reduced-motion users)
    if (digit && !reducedMotion.current) {
      inputRefs.current[index]?.animate(
        [
          { transform: 'scale(0.68)',  opacity: '0.3' },
          { transform: 'scale(1.09)', opacity: '1'   },
          { transform: 'scale(1)',    opacity: '1'   },
        ],
        { duration: 140, easing: 'cubic-bezier(0.2,0,0,1)' },
      );
    }
  }

  function handleKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      const next      = [...digits];
      next[index - 1] = '';
      setDigits(next);
      inputRefs.current[index - 1]?.focus();
    }
  }

  async function handleResend() {
    setResending(true);
    setResendMsg('');
    setError('');
    try {
      const res  = await fetch('/api/auth/resend', { method: 'POST' });
      const data = await res.json();
      if (data.ok) {
        setDigits(Array(CODE_LENGTH).fill(''));
        setSecondsLeft(data.ttlSeconds ?? CODE_TTL);
        setExpired(false);
        setResendMsg('A new code has been sent to your email.');
        inputRefs.current[0]?.focus();
      } else {
        setResendMsg(data.error?.message ?? 'Could not resend. Please try again.');
      }
    } catch {
      setResendMsg('Network error. Please try again.');
    } finally {
      setResending(false);
    }
  }

  // Timer display
  const timerRed = secondsLeft <= 10;
  const mm       = String(Math.floor(secondsLeft / 60)).padStart(2, '0');
  const ss       = String(secondsLeft % 60).padStart(2, '0');

  return (
    <div style={{
      minHeight:      '100vh',
      display:        'flex',
      alignItems:     'center',
      justifyContent: 'center',
      background:     'var(--bg)',
      position:       'relative',
      padding:        '1.5rem',
      overflow:       'hidden',
    }}>
      {/* Ambient page glow — gives the glass card something to blur against */}
      <div style={{
        position:      'absolute',
        inset:         0,
        background:    'radial-gradient(ellipse 70% 55% at 50% 35%, rgba(124,58,237,0.07) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} aria-hidden="true" />

      {/* Success ambient glow (fades in when verification succeeds) */}
      {succeeded && (
        <div style={{
          position:      'absolute',
          top:           '50%',
          left:          '50%',
          transform:     'translate(-50%, -50%)',
          width:         520,
          height:        520,
          borderRadius:  '50%',
          background:    'radial-gradient(ellipse at center, rgba(74,222,128,0.11) 0%, transparent 65%)',
          animation:     'dd-breathe 2.5s ease-in-out infinite',
          pointerEvents: 'none',
        }} aria-hidden="true" />
      )}

      {/* Theme toggle */}
      <div style={{ position: 'absolute', top: '1rem', right: '1rem', zIndex: 10 }}>
        <ThemeToggle size={15} />
      </div>

      {/* ── Glassmorphism card ───────────────────────────────────────────────── */}
      <div
        role="main"
        style={{
          width:                '100%',
          maxWidth:             370,
          background:           'var(--glass-bg)',
          backdropFilter:       'blur(18px)',
          WebkitBackdropFilter: 'blur(18px)',
          border:               '1px solid var(--glass-border)',
          borderRadius:         24,
          padding:              '2.5rem 2rem',
          display:              'flex',
          flexDirection:        'column',
          alignItems:           'center',
          gap:                  '1.5rem',
          boxShadow:            succeeded
            ? 'var(--glass-shadow), 0 0 80px rgba(74,222,128,0.16), 0 0 160px rgba(74,222,128,0.07)'
            : 'var(--glass-shadow)',
          transition:           'box-shadow 0.6s ease',
          animation:            'dd-card-in 0.45s cubic-bezier(0.2,0,0,1) both',
        }}
      >
        {succeeded ? (
          <SuccessView />
        ) : (
          <VerifyView
            digits={digits}
            error={error}
            loading={loading}
            expired={expired}
            resending={resending}
            resendMsg={resendMsg}
            focusedIndex={focusedIndex}
            shaking={shaking}
            timerRed={timerRed}
            mm={mm}
            ss={ss}
            inputRefs={inputRefs}
            onInput={handleInput}
            onKeyDown={handleKeyDown}
            onFocus={setFocusedIndex}
            onBlur={() => setFocusedIndex(null)}
            onResend={handleResend}
            onShakeEnd={() => setShaking(false)}
          />
        )}
      </div>
    </div>
  );
}

// ─── Verify view (normal state) ───────────────────────────────────────────────

interface VerifyViewProps {
  digits:       string[];
  error:        string;
  loading:      boolean;
  expired:      boolean;
  resending:    boolean;
  resendMsg:    string;
  focusedIndex: number | null;
  shaking:      boolean;
  timerRed:     boolean;
  mm:           string;
  ss:           string;
  inputRefs:    React.MutableRefObject<Array<HTMLInputElement | null>>;
  onInput:      (index: number, value: string) => void;
  onKeyDown:    (index: number, e: React.KeyboardEvent<HTMLInputElement>) => void;
  onFocus:      (index: number) => void;
  onBlur:       () => void;
  onResend:     () => void;
  onShakeEnd:   () => void;
}

function VerifyView({
  digits, error, loading, expired, resending, resendMsg,
  focusedIndex, shaking, timerRed, mm, ss,
  inputRefs, onInput, onKeyDown, onFocus, onBlur, onResend, onShakeEnd,
}: VerifyViewProps) {
  return (
    <>
      {/* Shield icon */}
      <div style={{
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'center',
        width:          56,
        height:         56,
        background:     'linear-gradient(135deg, rgba(124,58,237,0.16), rgba(167,139,250,0.07))',
        border:         '1px solid rgba(124,58,237,0.22)',
        borderRadius:   14,
        animation:      'dd-card-in 0.4s cubic-bezier(0.2,0,0,1) 0.07s both',
      }}>
        <ShieldCheck size={28} color="var(--accent-text)" />
      </div>

      {/* Heading */}
      <div style={{ textAlign: 'center', animation: 'dd-card-in 0.4s ease 0.12s both' }}>
        <h1 style={{
          fontSize:      '1.25rem',
          fontWeight:    700,
          color:         'var(--text-primary)',
          margin:        '0 0 0.4rem',
          letterSpacing: '-0.01em',
        }}>
          Verify your identity
        </h1>
        <p style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.65, maxWidth: 270 }}>
          We sent a 6-digit code to your email.<br />Enter it below to continue.
        </p>
      </div>

      {/* Plain countdown */}
      <div
        role="timer"
        aria-label={expired ? 'Code expired' : `${mm}:${ss} remaining`}
        aria-live="off"
        style={{
          animation:     'dd-card-in 0.4s ease 0.16s both',
          fontSize:      '1.75rem',
          fontFamily:    'monospace',
          fontWeight:    700,
          letterSpacing: '0.06em',
          color:         expired || timerRed ? 'var(--crit)' : 'var(--accent-text)',
          transition:    'color 0.3s ease',
          userSelect:    'none',
        }}
      >
        {expired ? 'Code expired' : `${mm}:${ss}`}
      </div>

      {/* OTP input row */}
      <div
        role="group"
        aria-label="6-digit verification code"
        style={{
          display:   'flex',
          gap:       '0.5rem',
          animation: shaking
            ? 'dd-shake 0.45s cubic-bezier(0.36,0.07,0.19,0.97) both'
            : undefined,
        }}
        onAnimationEnd={(e) => {
          if (e.animationName === 'dd-shake') onShakeEnd();
        }}
      >
        {Array.from({ length: CODE_LENGTH }).map((_, i) => {
          const focused  = focusedIndex === i;
          const hasDigit = Boolean(digits[i]);
          const disabled = loading || expired;

          const borderColor =
            shaking   ? 'var(--crit)'        :
            focused   ? 'var(--accent)'      :
            hasDigit  ? 'var(--accent-text)' :
            'var(--border-2)';

          return (
            <input
              key={i}
              ref={el => { inputRefs.current[i] = el; }}
              type="text"
              inputMode="numeric"
              pattern="\d*"
              maxLength={CODE_LENGTH}
              value={digits[i]}
              onChange={e => onInput(i, e.target.value)}
              onKeyDown={e => onKeyDown(i, e)}
              onFocus={() => onFocus(i)}
              onBlur={onBlur}
              disabled={disabled}
              autoFocus={i === 0}
              aria-label={`Digit ${i + 1} of ${CODE_LENGTH}`}
              style={{
                width:        '2.75rem',
                height:       '3.25rem',
                textAlign:    'center',
                fontSize:     '1.4rem',
                fontFamily:   'monospace',
                fontWeight:   700,
                background:   'var(--surface-2)',
                border:       `2px solid ${borderColor}`,
                borderRadius: 10,
                color:        'var(--text-primary)',
                outline:      'none',
                cursor:       disabled ? 'not-allowed' : 'text',
                opacity:      disabled ? 0.45 : 1,
                transform:    focused ? 'scale(1.05)' : 'scale(1)',
                boxShadow:    focused
                  ? '0 0 0 3px rgba(124,58,237,0.22), 0 0 14px rgba(124,58,237,0.12)'
                  : 'none',
                transition:   'border-color 0.14s, box-shadow 0.14s, transform 0.14s, opacity 0.2s',
                // Staggered entrance — fills forward, starts hidden before delay fires
                animation:    `dd-box-in 0.32s cubic-bezier(0.2,0,0,1) ${i * 55}ms both`,
              }}
            />
          );
        })}
      </div>

      {/* Loading indicator */}
      {loading && (
        <div style={{
          display:    'flex',
          alignItems: 'center',
          gap:        '0.5rem',
          color:      'var(--muted)',
          fontSize:   12,
          animation:  'dd-card-in 0.2s ease both',
        }}>
          <div
            style={{
              width:        16,
              height:       16,
              border:       '2px solid var(--border-2)',
              borderTop:    '2px solid var(--accent)',
              borderRadius: '50%',
              animation:    'dd-spin 0.7s linear infinite',
              flexShrink:   0,
            }}
            aria-hidden="true"
          />
          <span>Verifying…</span>
        </div>
      )}

      {/* Error message */}
      {error && !loading && (
        <p
          role="alert"
          style={{
            fontSize:    13,
            color:       'var(--crit)',
            textAlign:   'center',
            padding:     '0.5rem 0.75rem',
            background:  'rgba(220,38,38,0.07)',
            border:      '1px solid rgba(220,38,38,0.18)',
            borderRadius: 8,
            width:       '100%',
            margin:       0,
            animation:   'dd-card-in 0.25s ease both',
          }}
        >
          {error}
        </p>
      )}

      {/* Resend */}
      <div style={{ textAlign: 'center' }}>
        <button
          onClick={onResend}
          disabled={resending || loading}
          style={{
            background:          'none',
            border:              'none',
            color:               (resending || loading) ? 'var(--muted)' : 'var(--accent-text)',
            cursor:              (resending || loading) ? 'not-allowed' : 'pointer',
            fontSize:            13,
            fontWeight:          600,
            padding:             '0.3rem 0',
            textDecoration:      'underline',
            textUnderlineOffset: 3,
            opacity:             (resending || loading) ? 0.6 : 1,
            transition:          'opacity 0.15s, color 0.15s',
          }}
        >
          {resending ? 'Sending…' : 'Resend code'}
        </button>
        {resendMsg && (
          <p style={{
            fontSize:  12,
            color:     resendMsg.startsWith('A new') ? 'var(--ok)' : 'var(--crit)',
            marginTop: '0.4rem',
            animation: 'dd-card-in 0.25s ease both',
          }}>
            {resendMsg}
          </p>
        )}
      </div>

      {/* Brand footer */}
      <div style={{
        display:        'flex',
        alignItems:     'center',
        gap:            '0.4rem',
        color:          'var(--muted)',
        fontSize:       11,
        fontFamily:     'monospace',
        borderTop:      '1px solid var(--border)',
        paddingTop:     '1rem',
        width:          '100%',
        justifyContent: 'center',
      }}>
        <ServerCog size={12} aria-hidden="true" />
        DD Monitor · Zain Iraq
      </div>
    </>
  );
}

// ─── Success view ─────────────────────────────────────────────────────────────

function SuccessView() {
  // Ring geometry for the 64×64 SVG (r=26, circ≈163.4 → css keyframe uses 164)
  const SVG_R = 26;

  return (
    <div style={{
      display:       'flex',
      flexDirection: 'column',
      alignItems:    'center',
      gap:           '1.25rem',
      padding:       '0.5rem 0',
    }}>
      {/* Animated SVG checkmark */}
      <svg
        width="72" height="72"
        viewBox="0 0 64 64"
        fill="none"
        role="img"
        aria-label="Verification successful"
        style={{ overflow: 'visible' }}
      >
        <defs>
          {/* Soft glow around the ring */}
          <filter id="dd-ok-glow" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Static track ring */}
        <circle cx="32" cy="32" r={SVG_R} fill="none" stroke="var(--border-2)" strokeWidth="2" />

        {/* Animated draw ring — starts hidden (dashoffset=164 via keyframe "from") */}
        <circle
          cx="32" cy="32" r={SVG_R}
          fill="none"
          stroke="var(--ok)"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray={164}
          style={{
            animation: 'dd-ring-draw 0.5s cubic-bezier(0.4,0,0.2,1) 0.05s both',
            filter:    'url(#dd-ok-glow)',
          }}
        />

        {/* Animated checkmark path — starts hidden (dashoffset=46 via keyframe "from") */}
        <path
          d="M 16 32 L 26 42 L 48 20"
          stroke="var(--ok)"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray={46}
          style={{
            animation: 'dd-check-draw 0.35s ease-out 0.45s both',
          }}
        />
      </svg>

      {/* Success text */}
      <div style={{ textAlign: 'center', animation: 'dd-success-text-in 0.4s ease 0.65s both' }}>
        <h1 style={{
          fontSize:      '1.2rem',
          fontWeight:    700,
          color:         'var(--text-primary)',
          margin:        '0 0 0.35rem',
          letterSpacing: '-0.01em',
        }}>
          Verified successfully
        </h1>
        <p style={{ fontSize: 13, color: 'var(--muted)' }}>
          Redirecting to your dashboard…
        </p>
      </div>

      {/* Redirect spinner */}
      <div
        style={{
          width:        18,
          height:       18,
          border:       '2px solid var(--border-2)',
          borderTop:    '2px solid var(--ok)',
          borderRadius: '50%',
          animation:    'dd-spin 0.9s linear 1s infinite',
          opacity:      0.7,
        }}
        aria-hidden="true"
      />
    </div>
  );
}
