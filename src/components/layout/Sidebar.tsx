'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard, Bell, FileText, Users, Settings,
  LogOut, ChevronRight, ChevronLeft,
} from 'lucide-react';

const SIDEBAR_COOKIE = 'dd-sidebar';
const W_COLLAPSED = 56;
const W_EXPANDED  = 210;

const GROUPS = ['BAG', 'OFFSET', 'AVAMAR'] as const;

const GROUP_ABBR: Record<typeof GROUPS[number], string> = {
  BAG:    'BAG',
  OFFSET: 'OFF',
  AVAMAR: 'AVA',
};

interface SidebarProps {
  initialCollapsed?: boolean;
}

export function Sidebar({ initialCollapsed = true }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const pathname = usePathname();
  const router   = useRouter();

  // Sync CSS variable and cookie whenever state changes
  useEffect(() => {
    const w = collapsed ? `${W_COLLAPSED}px` : `${W_EXPANDED}px`;
    document.documentElement.style.setProperty('--sidebar-w', w);
    document.cookie = `${SIDEBAR_COOKIE}=${collapsed ? 'collapsed' : 'expanded'}; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax`;
  }, [collapsed]);

  function isActive(href: string) {
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href);
  }

  function isGroupActive(group: string) {
    return pathname === `/g/${group}`;
  }

  async function handleSignOut() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  }

  const w = collapsed ? W_COLLAPSED : W_EXPANDED;

  return (
    <nav
      style={{
        position:      'fixed',
        left:          0,
        top:           0,
        bottom:        0,
        width:         w,
        background:    'var(--surface)',
        borderRight:   '1px solid var(--border)',
        display:       'flex',
        flexDirection: 'column',
        alignItems:    'stretch',
        paddingTop:    '0.75rem',
        paddingBottom: '0.75rem',
        zIndex:        40,
        gap:           2,
        transition:    'width 0.2s ease',
        overflow:      'hidden',
      }}
    >
      {/* ── Logo ─────────────────────────────────────────────────────────────── */}
      <div
        style={{
          display:        'flex',
          justifyContent: collapsed ? 'center' : 'flex-start',
          paddingLeft:    collapsed ? 0 : 11,
          marginBottom:   4,
          flexShrink:     0,
        }}
      >
        <div
          style={{
            width:          34,
            height:         34,
            background:     'var(--accent)',
            borderRadius:   7,
            display:        'flex',
            alignItems:     'center',
            justifyContent: 'center',
            fontSize:       11,
            fontWeight:     800,
            letterSpacing:  1,
            color:          '#fff',
            flexShrink:     0,
          }}
        >
          DD
        </div>
      </div>

      {/* ── Toggle button ─────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: collapsed ? 'center' : 'flex-start', paddingLeft: collapsed ? 0 : 10, marginBottom: 6, flexShrink: 0 }}>
        <button
          onClick={() => setCollapsed(c => !c)}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          style={{
            display:        'flex',
            alignItems:     'center',
            justifyContent: 'center',
            width:          36,
            height:         28,
            background:     'none',
            border:         'none',
            cursor:         'pointer',
            color:          'var(--muted)',
            borderRadius:   6,
            padding:        0,
            flexShrink:     0,
          }}
        >
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>

      {/* ── All Fleet ─────────────────────────────────────────────────────────── */}
      <div style={{ paddingLeft: 10, paddingRight: 10 }}>
        <NavLink
          href="/"
          icon={<LayoutDashboard size={18} />}
          label="Overview"
          active={isActive('/') && !GROUPS.some(g => isGroupActive(g))}
          collapsed={collapsed}
        />
      </div>

      {/* ── Group buttons ─────────────────────────────────────────────────────── */}
      <div style={{ paddingLeft: 10, paddingRight: 10, display: 'flex', flexDirection: 'column', gap: 1 }}>
        {GROUPS.map(g => {
          const active = isGroupActive(g);
          return (
            <Link
              key={g}
              href={`/g/${g}`}
              title={collapsed ? g : undefined}
              style={{
                display:         'flex',
                alignItems:      'center',
                justifyContent:  collapsed ? 'center' : 'flex-start',
                gap:             collapsed ? 0 : '0.5rem',
                height:          30,
                textDecoration:  'none',
                borderRadius:    6,
                color:           active ? 'var(--accent-text)' : 'var(--muted)',
                background:      active ? 'rgba(124,58,237,0.18)' : 'transparent',
                paddingLeft:     collapsed ? 0 : '0.5rem',
                flexShrink:      0,
              }}
            >
              <span
                style={{
                  display:        'flex',
                  alignItems:     'center',
                  justifyContent: 'center',
                  width:          collapsed ? 36 : 22,
                  fontSize:       10,
                  fontWeight:     700,
                  letterSpacing:  0.5,
                  flexShrink:     0,
                }}
              >
                {GROUP_ABBR[g]}
              </span>
              {!collapsed && (
                <span style={{ fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', letterSpacing: 0.3 }}>
                  {g}
                </span>
              )}
            </Link>
          );
        })}
      </div>

      {/* ── Divider ───────────────────────────────────────────────────────────── */}
      <div
        style={{
          height:     1,
          background: 'var(--border)',
          margin:     '4px 10px',
          flexShrink: 0,
        }}
      />

      {/* ── Main nav: Alerts → Reports → Users → Settings ─────────────────────── */}
      <div style={{ flex: 1, paddingLeft: 10, paddingRight: 10, display: 'flex', flexDirection: 'column', gap: 1 }}>
        <NavLink href="/alerts"   icon={<Bell size={18} />}     label="Alerts"   active={isActive('/alerts')}   collapsed={collapsed} />
        <NavLink href="/reports"  icon={<FileText size={18} />} label="Reports"  active={isActive('/reports')}  collapsed={collapsed} />
        <NavLink href="/users"    icon={<Users size={18} />}    label="Users"    active={isActive('/users')}    collapsed={collapsed} />
        <NavLink href="/settings" icon={<Settings size={18} />} label="Settings" active={isActive('/settings')} collapsed={collapsed} />
      </div>

      {/* ── Sign out (bottom-pinned) ───────────────────────────────────────────── */}
      <div style={{ paddingLeft: 10, paddingRight: 10, flexShrink: 0 }}>
        <button
          onClick={handleSignOut}
          title={collapsed ? 'Sign out' : undefined}
          style={{
            display:        'flex',
            alignItems:     'center',
            justifyContent: collapsed ? 'center' : 'flex-start',
            gap:            collapsed ? 0 : '0.5rem',
            width:          '100%',
            height:         36,
            background:     'none',
            border:         'none',
            cursor:         'pointer',
            color:          'var(--crit)',
            borderRadius:   6,
            padding:        0,
            paddingLeft:    collapsed ? 0 : '0.5rem',
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: collapsed ? 36 : 18, flexShrink: 0 }}>
            <LogOut size={18} />
          </span>
          {!collapsed && (
            <span style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap' }}>
              Sign out
            </span>
          )}
        </button>
      </div>
    </nav>
  );
}

// ── Shared nav link ────────────────────────────────────────────────────────────

interface NavLinkProps {
  href:      string;
  icon:      React.ReactNode;
  label:     string;
  active:    boolean;
  collapsed: boolean;
}

function NavLink({ href, icon, label, active, collapsed }: NavLinkProps) {
  return (
    <Link
      href={href}
      title={collapsed ? label : undefined}
      style={{
        display:        'flex',
        alignItems:     'center',
        justifyContent: collapsed ? 'center' : 'flex-start',
        gap:            collapsed ? 0 : '0.5rem',
        width:          '100%',
        height:         36,
        textDecoration: 'none',
        borderRadius:   6,
        color:          active ? 'var(--accent-text)' : 'var(--muted)',
        background:     active ? 'rgba(124,58,237,0.18)' : 'transparent',
        paddingLeft:    collapsed ? 0 : '0.5rem',
        flexShrink:     0,
      }}
    >
      <span
        style={{
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'center',
          width:          collapsed ? 36 : 18,
          flexShrink:     0,
        }}
      >
        {icon}
      </span>
      {!collapsed && (
        <span style={{ fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap' }}>
          {label}
        </span>
      )}
    </Link>
  );
}
