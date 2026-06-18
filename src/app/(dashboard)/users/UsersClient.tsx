'use client';

import { useState, useEffect, useCallback } from 'react';
import { checkPasswordPolicy }              from '@/lib/auth/passwordPolicy';

// ─── Types ─────────────────────────────────────────────────────────────────────

type AdminUser = {
  id:              string;
  email:           string;
  full_name:       string | null;
  role:            'admin' | 'viewer';
  status:          'active' | 'locked';
  last_sign_in_at: string | null;
  created_at:      string;
};

type FilterKey = 'all' | 'admin' | 'viewer' | 'locked';

const FILTER_LABELS: Record<FilterKey, string> = {
  all: 'All', admin: 'Admins', viewer: 'Viewers', locked: 'Locked',
};

const POLICY_LABELS: Record<string, string> = {
  minLength: 'At least 10 characters',
  uppercase: 'Uppercase letter (A–Z)',
  lowercase: 'Lowercase letter (a–z)',
  digit:     'Digit (0–9)',
  symbol:    'Symbol ($, !, &, or ))',
};

// ─── Formatters ────────────────────────────────────────────────────────────────

function relativeTime(iso: string | null): string {
  if (!iso) return 'Never';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1)  return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7)  return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-GB');
}

function absTime(iso: string | null): string {
  if (!iso) return 'Never signed in';
  return new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Baghdad',
  }).format(new Date(iso));
}

// ─── Shared style helpers ──────────────────────────────────────────────────────

function inputSt(disabled: boolean): React.CSSProperties {
  return {
    background: 'var(--bg)', border: '1px solid var(--border)',
    borderRadius: 4, color: 'var(--text-primary)', padding: '0.35rem 0.5rem',
    fontSize: 12, width: '100%',
    opacity: disabled ? 0.5 : 1, cursor: disabled ? 'not-allowed' : 'auto',
  };
}

function btnSt(variant: 'primary' | 'ghost' | 'danger', disabled?: boolean): React.CSSProperties {
  const base: React.CSSProperties = {
    padding: '0.3rem 0.75rem', borderRadius: 5, fontSize: 12, fontWeight: 600,
    cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1,
    border: '1px solid transparent',
  };
  if (variant === 'primary') return { ...base, background: 'var(--accent)', color: '#fff' };
  if (variant === 'danger')  return { ...base, background: 'rgba(220,38,38,0.15)', color: 'var(--crit)', borderColor: 'rgba(220,38,38,0.3)' };
  return { ...base, background: 'transparent', color: 'var(--muted)', borderColor: 'var(--border)' };
}

function chipSt(active: boolean): React.CSSProperties {
  return {
    padding: '0.25rem 0.75rem', borderRadius: 4, fontSize: 12, fontWeight: 600,
    cursor: 'pointer', border: `1px solid ${active ? 'transparent' : 'var(--border)'}`,
    background: active ? 'rgba(124,58,237,0.18)' : 'transparent',
    color: active ? 'var(--accent-text)' : 'var(--muted)',
  };
}

function cardSt(extra?: React.CSSProperties): React.CSSProperties {
  return { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', ...extra };
}

// ─── Password policy checklist ─────────────────────────────────────────────────

function PolicyChecklist({ password }: { password: string }) {
  const { violations } = checkPasswordPolicy(password);
  const violSet = new Set(violations.map(v => v.rule));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {(['minLength', 'uppercase', 'lowercase', 'digit', 'symbol'] as const).map(rule => {
        const met   = password !== '' && !violSet.has(rule);
        const color = password === '' ? 'var(--muted)' : met ? 'var(--ok)' : 'var(--crit)';
        return (
          <div key={rule} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
            <span style={{ fontSize: 12, color }}>{POLICY_LABELS[rule]}</span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

export function UsersClient({ currentUserId }: { currentUserId: string }) {
  const [users,     setUsers]     = useState<AdminUser[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [err,       setErr]       = useState<string | null>(null);
  const [actionErr, setActionErr] = useState<string | null>(null);
  const [search,    setSearch]    = useState('');
  const [filter,    setFilter]    = useState<FilterKey>('all');

  // Reset password panel
  const [resetTarget,  setResetTarget]  = useState<AdminUser | null>(null);
  const [resetPwd,     setResetPwd]     = useState('');
  const [resetConfirm, setResetConfirm] = useState('');
  const [resetSaving,  setResetSaving]  = useState(false);
  const [resetErr,     setResetErr]     = useState<string | null>(null);

  // Add user panel
  const [showAdd,   setShowAdd]   = useState(false);
  const [addEmail,  setAddEmail]  = useState('');
  const [addName,   setAddName]   = useState('');
  const [addRole,   setAddRole]   = useState<'admin' | 'viewer'>('viewer');
  const [addPwd,    setAddPwd]    = useState('');
  const [addSaving, setAddSaving] = useState(false);
  const [addErr,    setAddErr]    = useState<string | null>(null);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch('/api/admin/users');
      if (!res.ok) throw new Error(await res.text());
      const json = await res.json() as { users: AdminUser[] };
      setUsers(json.users);
    } catch (e) {
      setErr(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void fetchUsers(); }, [fetchUsers]);

  // Derived counts (over the full list, not filtered)
  const totalAdmins  = users.filter(u => u.role === 'admin').length;
  const totalViewers = users.filter(u => u.role === 'viewer').length;
  const totalLocked  = users.filter(u => u.status === 'locked').length;

  // Client-side filtering
  const filtered = users.filter(u => {
    if (search && !u.email.toLowerCase().includes(search.toLowerCase())) return false;
    if (filter === 'admin')  return u.role === 'admin';
    if (filter === 'viewer') return u.role === 'viewer';
    if (filter === 'locked') return u.status === 'locked';
    return true;
  });

  // ── Mutations ─────────────────────────────────────────────────────────────

  async function changeRole(id: string, role: 'admin' | 'viewer') {
    setActionErr(null);
    const res = await fetch(`/api/admin/users/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'setRole', role }),
    });
    if (!res.ok) { setActionErr(await res.text()); return; }
    setUsers(prev => prev.map(u => u.id === id ? { ...u, role } : u));
  }

  async function toggleLock(u: AdminUser) {
    setActionErr(null);
    const locking = u.status === 'active';
    if (locking && !confirm(`Lock account ${u.email}? They will not be able to sign in.`)) return;
    const res = await fetch(`/api/admin/users/${u.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: locking ? 'ban' : 'unban' }),
    });
    if (!res.ok) { setActionErr(await res.text()); return; }
    setUsers(prev => prev.map(x => x.id === u.id ? { ...x, status: locking ? 'locked' : 'active' } : x));
  }

  async function deleteUser(u: AdminUser) {
    if (!confirm(`Permanently delete ${u.email}? This cannot be undone.`)) return;
    setActionErr(null);
    const res = await fetch(`/api/admin/users/${u.id}`, { method: 'DELETE' });
    if (!res.ok) { setActionErr(await res.text()); return; }
    setUsers(prev => prev.filter(x => x.id !== u.id));
    if (resetTarget?.id === u.id) closeReset();
  }

  async function submitReset(e: React.FormEvent) {
    e.preventDefault();
    if (!resetTarget) return;
    setResetErr(null);
    if (resetPwd !== resetConfirm) { setResetErr('Passwords do not match.'); return; }
    if (!checkPasswordPolicy(resetPwd).valid) { setResetErr('Password does not meet policy requirements.'); return; }
    setResetSaving(true);
    const res = await fetch(`/api/admin/users/${resetTarget.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'setPassword', password: resetPwd }),
    });
    setResetSaving(false);
    if (!res.ok) { setResetErr(await res.text()); return; }
    closeReset();
  }

  async function addUser(e: React.FormEvent) {
    e.preventDefault();
    if (!checkPasswordPolicy(addPwd).valid) { setAddErr('Password does not meet policy requirements.'); return; }
    setAddSaving(true);
    setAddErr(null);
    const res = await fetch('/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: addEmail, full_name: addName || null, role: addRole, password: addPwd }),
    });
    if (!res.ok) { setAddErr(await res.text()); setAddSaving(false); return; }
    setAddEmail(''); setAddName(''); setAddPwd(''); setAddRole('viewer');
    setShowAdd(false);
    await fetchUsers();
    setAddSaving(false);
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  function openReset(u: AdminUser) {
    setResetTarget(u); setResetPwd(''); setResetConfirm(''); setResetErr(null);
    setShowAdd(false);
  }
  function closeReset() { setResetTarget(null); setResetPwd(''); setResetConfirm(''); setResetErr(null); }

  const resetPolicyOk  = checkPasswordPolicy(resetPwd).valid && resetPwd === resetConfirm;
  const addPolicyOk    = checkPasswordPolicy(addPwd).valid;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

      {/* Header row: count summary + Add button */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
        <span style={{ fontSize: 13, color: 'var(--muted)' }}>
          {!loading && (
            `${users.length} user${users.length !== 1 ? 's' : ''} · ${totalAdmins} admin${totalAdmins !== 1 ? 's' : ''} · ${totalViewers} viewer${totalViewers !== 1 ? 's' : ''} · ${totalLocked} locked`
          )}
        </span>
        <button
          style={btnSt('primary')}
          onClick={() => { setShowAdd(s => !s); setResetTarget(null); setActionErr(null); }}
        >
          {showAdd ? '✕ Cancel' : '+ Add user'}
        </button>
      </div>

      {/* Toolbar: search + filter chips */}
      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          type="search"
          placeholder="Search by email…"
          value={search}
          style={{ ...inputSt(false), width: 260 }}
          onChange={e => setSearch(e.target.value)}
        />
        <div style={{ display: 'flex', gap: 4 }}>
          {(['all', 'admin', 'viewer', 'locked'] as const).map(f => (
            <button key={f} style={chipSt(filter === f)} onClick={() => setFilter(f)}>
              {FILTER_LABELS[f]}
            </button>
          ))}
        </div>
      </div>

      {/* Action error banner */}
      {actionErr && (
        <div style={{
          padding: '0.6rem 1rem', borderRadius: 6, fontSize: 12,
          background: 'rgba(220,38,38,0.1)', color: 'var(--crit)',
          border: '1px solid rgba(220,38,38,0.3)',
        }}>
          {actionErr}
        </div>
      )}

      {/* Reset password panel */}
      {resetTarget && (
        <div style={cardSt({ overflow: 'visible', padding: '1.25rem' })}>
          <h4 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 0.9rem' }}>
            Reset password for{' '}
            <span style={{ color: 'var(--accent-text)' }}>{resetTarget.email}</span>
          </h4>
          <form onSubmit={submitReset} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxWidth: 400 }}>
            <div>
              <label style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>
                New password *
              </label>
              <input
                required type="password" value={resetPwd}
                style={inputSt(false)} autoComplete="new-password"
                onChange={e => setResetPwd(e.target.value)}
              />
            </div>
            <div>
              <label style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>
                Confirm password *
              </label>
              <input
                required type="password" value={resetConfirm}
                style={inputSt(false)} autoComplete="new-password"
                onChange={e => setResetConfirm(e.target.value)}
              />
            </div>
            <PolicyChecklist password={resetPwd} />
            {resetConfirm && resetPwd !== resetConfirm && (
              <p style={{ fontSize: 12, color: 'var(--crit)', margin: 0 }}>Passwords do not match.</p>
            )}
            {resetErr && <p style={{ fontSize: 12, color: 'var(--crit)', margin: 0 }}>{resetErr}</p>}
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="submit"
                style={btnSt('primary', resetSaving || !resetPolicyOk)}
                disabled={resetSaving || !resetPolicyOk}
              >
                {resetSaving ? 'Saving…' : 'Save password'}
              </button>
              <button type="button" style={btnSt('ghost')} onClick={closeReset}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      {/* Users table */}
      <div style={cardSt()}>
        {loading ? (
          <p style={{ padding: '3rem', textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>Loading…</p>
        ) : err ? (
          <p style={{ padding: '3rem', textAlign: 'center', color: 'var(--crit)', fontSize: 13 }}>{err}</p>
        ) : filtered.length === 0 ? (
          <p style={{ padding: '3rem', textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
            {search || filter !== 'all' ? 'No users match the current filter.' : 'No users found.'}
          </p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['Email', 'Role', 'Status', 'Last sign-in', 'Created', 'Actions'].map(h => (
                    <th key={h} style={{
                      textAlign: 'left', padding: '0.5rem 1rem',
                      color: 'var(--muted)', fontWeight: 600, fontSize: 11, whiteSpace: 'nowrap',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(u => {
                  const isSelf = u.id === currentUserId;
                  return (
                    <tr
                      key={u.id}
                      style={{
                        borderBottom: '1px solid var(--border)',
                        background: resetTarget?.id === u.id ? 'rgba(124,58,237,0.06)' : undefined,
                      }}
                    >
                      {/* Email + name */}
                      <td style={{ padding: '0.6rem 1rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ color: 'var(--text-primary)' }}>{u.email}</span>
                          {isSelf && (
                            <span style={{
                              fontSize: 10, fontWeight: 700,
                              color: 'var(--accent-text)',
                              background: 'rgba(124,58,237,0.18)',
                              padding: '1px 5px', borderRadius: 3,
                            }}>you</span>
                          )}
                        </div>
                        {u.full_name && (
                          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                            {u.full_name}
                          </div>
                        )}
                      </td>

                      {/* Role badge */}
                      <td style={{ padding: '0.6rem 1rem' }}>
                        <span style={{
                          padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600,
                          background: u.role === 'admin' ? 'rgba(124,58,237,0.18)' : 'rgba(156,163,175,0.15)',
                          color:      u.role === 'admin' ? 'var(--accent-text)'    : 'var(--muted)',
                        }}>{u.role}</span>
                      </td>

                      {/* Status badge */}
                      <td style={{ padding: '0.6rem 1rem' }}>
                        <span style={{
                          padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600,
                          background: u.status === 'active' ? 'rgba(34,197,94,0.12)' : 'rgba(220,38,38,0.12)',
                          color:      u.status === 'active' ? 'var(--ok)'            : 'var(--crit)',
                        }}>{u.status === 'active' ? 'Active' : 'Locked'}</span>
                      </td>

                      {/* Last sign-in (relative; absolute on hover) */}
                      <td
                        style={{ padding: '0.6rem 1rem', color: 'var(--muted)', whiteSpace: 'nowrap', cursor: 'default' }}
                        title={absTime(u.last_sign_in_at)}
                      >
                        {relativeTime(u.last_sign_in_at)}
                      </td>

                      {/* Created */}
                      <td style={{ padding: '0.6rem 1rem', color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                        {new Date(u.created_at).toLocaleDateString('en-GB')}
                      </td>

                      {/* Actions */}
                      <td style={{ padding: '0.6rem 1rem' }}>
                        {isSelf ? (
                          <span style={{ fontSize: 11, color: 'var(--muted)' }}>—</span>
                        ) : (
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                            <button
                              style={btnSt('ghost')}
                              onClick={() => openReset(u)}
                            >
                              Reset pwd
                            </button>
                            <select
                              value={u.role}
                              style={{ ...inputSt(false), width: 'auto', padding: '0.25rem 0.4rem' }}
                              onChange={e => changeRole(u.id, e.target.value as 'admin' | 'viewer')}
                            >
                              <option value="viewer">viewer</option>
                              <option value="admin">admin</option>
                            </select>
                            <button
                              style={btnSt(u.status === 'locked' ? 'ghost' : 'danger')}
                              onClick={() => toggleLock(u)}
                            >
                              {u.status === 'locked' ? 'Unlock' : 'Lock'}
                            </button>
                            <button style={btnSt('danger')} onClick={() => deleteUser(u)}>
                              Delete
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add user panel */}
      {showAdd && (
        <div style={cardSt({ overflow: 'visible', padding: '1.25rem' })}>
          <h4 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 1rem' }}>
            Add New User
          </h4>
          <form
            onSubmit={addUser}
            style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxWidth: 420 }}
          >
            <div>
              <label style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Email *</label>
              <input
                required type="email" value={addEmail}
                style={inputSt(false)} autoComplete="off"
                onChange={e => setAddEmail(e.target.value)}
              />
            </div>
            <div>
              <label style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Full name</label>
              <input
                type="text" value={addName}
                style={inputSt(false)}
                onChange={e => setAddName(e.target.value)}
              />
            </div>
            <div>
              <label style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Role</label>
              <select
                value={addRole}
                style={{ ...inputSt(false), width: 'auto' }}
                onChange={e => setAddRole(e.target.value as 'admin' | 'viewer')}
              >
                <option value="viewer">viewer</option>
                <option value="admin">admin</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Password *</label>
              <input
                required type="password" value={addPwd}
                style={inputSt(false)} autoComplete="new-password"
                onChange={e => setAddPwd(e.target.value)}
              />
            </div>
            <PolicyChecklist password={addPwd} />
            {addErr && <p style={{ fontSize: 12, color: 'var(--crit)', margin: 0 }}>{addErr}</p>}
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="submit"
                style={btnSt('primary', addSaving || !addPolicyOk)}
                disabled={addSaving || !addPolicyOk}
              >
                {addSaving ? 'Creating…' : 'Create user'}
              </button>
              <button
                type="button"
                style={btnSt('ghost')}
                onClick={() => { setShowAdd(false); setAddErr(null); }}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
