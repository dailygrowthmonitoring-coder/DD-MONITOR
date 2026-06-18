'use client';

import { useState }           from 'react';
import type { Tables }        from '@/lib/db/types';
import { DEVICE_GROUPS }      from '@/lib/db/types';
import { ThemeToggle }        from '@/components/ui/ThemeToggle';
import {
  updateAlertRule,
  updateDevice,
  upsertAppSetting,
}                             from './actions';

// ─── Shared style helpers ──────────────────────────────────────────────────────

const SEV_COLOR: Record<string, string> = {
  critical: 'var(--crit)',
  warning:  'var(--warn)',
};

function card(extra?: React.CSSProperties): React.CSSProperties {
  return {
    background: 'var(--surface)', border: '1px solid var(--border)',
    borderRadius: 8, overflow: 'hidden', ...extra,
  };
}

function labelStyle(): React.CSSProperties {
  return { fontSize: 11, color: 'var(--muted)', fontWeight: 600,
    textAlign: 'left', padding: '0.5rem 1rem', whiteSpace: 'nowrap' };
}

function inputStyle(disabled: boolean): React.CSSProperties {
  return {
    background: 'var(--bg)', border: '1px solid var(--border)',
    borderRadius: 4, color: 'var(--text-primary)', padding: '0.3rem 0.5rem',
    fontSize: 12, width: '100%',
    opacity: disabled ? 0.5 : 1, cursor: disabled ? 'not-allowed' : 'auto',
  };
}

function btnStyle(variant: 'primary' | 'ghost' | 'danger', disabled?: boolean): React.CSSProperties {
  const base: React.CSSProperties = {
    padding: '0.3rem 0.75rem', borderRadius: 5, fontSize: 12, fontWeight: 600,
    cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1,
    border: '1px solid transparent',
  };
  if (variant === 'primary') return { ...base, background: 'var(--accent)', color: '#fff' };
  if (variant === 'danger')  return { ...base, background: 'rgba(220,38,38,0.15)', color: 'var(--crit)', borderColor: 'rgba(220,38,38,0.3)' };
  return { ...base, background: 'transparent', color: 'var(--muted)', borderColor: 'var(--border)' };
}

// ─── Alert Rules Section ───────────────────────────────────────────────────────

type AlertRule = Tables<'alert_rules'>;

function AlertRulesSection({ rules: initial, isAdmin }: { rules: AlertRule[]; isAdmin: boolean }) {
  const [rules,   setRules]   = useState(initial);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft,   setDraft]   = useState<Partial<AlertRule>>({});
  const [saving,  setSaving]  = useState(false);
  const [err,     setErr]     = useState<string | null>(null);

  function startEdit(r: AlertRule) {
    setEditing(r.id);
    setDraft({ threshold: r.threshold, severity: r.severity, enabled: r.enabled });
    setErr(null);
  }
  function cancelEdit() { setEditing(null); setDraft({}); setErr(null); }

  async function save(id: string) {
    setSaving(true); setErr(null);
    const res = await updateAlertRule(id, {
      threshold: draft.threshold,
      severity:  draft.severity as AlertRule['severity'],
      enabled:   draft.enabled,
    });
    setSaving(false);
    if (!res.ok) { setErr(res.error ?? 'Save failed'); return; }
    setRules(prev => prev.map(r => r.id === id ? { ...r, ...draft } as AlertRule : r));
    setEditing(null);
  }

  return (
    <div style={card()}>
      <div style={{ padding: '0.9rem 1.25rem', borderBottom: '1px solid var(--border)' }}>
        <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Alert Rules</h3>
        <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: '0.15rem' }}>
          Threshold values and severity levels for automated alerts.
        </p>
      </div>
      {err && (
        <div style={{ padding: '0.6rem 1.25rem', background: 'rgba(220,38,38,0.1)', color: 'var(--crit)', fontSize: 12 }}>
          {err}
        </div>
      )}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              {['Name', 'Metric', 'Op', 'Threshold', 'Severity', 'Enabled', ''].map(h => (
                <th key={h} style={labelStyle()}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rules.map(r => {
              const isEdit = editing === r.id;
              return (
                <tr key={r.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '0.55rem 1rem', color: 'var(--text-primary)' }}>{r.name}</td>
                  <td style={{ padding: '0.55rem 1rem', color: 'var(--muted)', fontFamily: 'monospace', fontSize: 11 }}>{r.metric}</td>
                  <td style={{ padding: '0.55rem 1rem', color: 'var(--muted)', fontFamily: 'monospace' }}>{r.operator}</td>
                  <td style={{ padding: '0.55rem 1rem', minWidth: 100 }}>
                    {isEdit ? (
                      <input
                        type="number" value={draft.threshold ?? ''}
                        style={inputStyle(false)}
                        onChange={e => setDraft(d => ({ ...d, threshold: e.target.value === '' ? null : Number(e.target.value) }))}
                      />
                    ) : (
                      <span style={{ color: 'var(--text-primary)' }}>{r.threshold ?? '—'}</span>
                    )}
                  </td>
                  <td style={{ padding: '0.55rem 1rem', minWidth: 120 }}>
                    {isEdit ? (
                      <select
                        value={draft.severity ?? r.severity} style={inputStyle(false)}
                        onChange={e => setDraft(d => ({ ...d, severity: e.target.value as AlertRule['severity'] }))}
                      >
                        <option value="warning">warning</option>
                        <option value="critical">critical</option>
                      </select>
                    ) : (
                      <span style={{ color: SEV_COLOR[r.severity] ?? 'var(--muted)', fontWeight: 600 }}>
                        {r.severity}
                      </span>
                    )}
                  </td>
                  <td style={{ padding: '0.55rem 1rem', minWidth: 80 }}>
                    {isEdit ? (
                      <input type="checkbox"
                        checked={draft.enabled ?? r.enabled} disabled={!isAdmin}
                        style={{ accentColor: 'var(--accent)', width: 16, height: 16 }}
                        onChange={e => setDraft(d => ({ ...d, enabled: e.target.checked }))}
                      />
                    ) : (
                      <span style={{ color: r.enabled ? 'var(--ok)' : 'var(--muted)' }}>
                        {r.enabled ? 'On' : 'Off'}
                      </span>
                    )}
                  </td>
                  <td style={{ padding: '0.55rem 1rem', whiteSpace: 'nowrap' }}>
                    {isAdmin && (
                      isEdit ? (
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button style={btnStyle('primary', saving)} disabled={saving}
                            onClick={() => save(r.id)}>Save</button>
                          <button style={btnStyle('ghost')} onClick={cancelEdit}>Cancel</button>
                        </div>
                      ) : (
                        <button style={btnStyle('ghost')} onClick={() => startEdit(r)}>Edit</button>
                      )
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Device Classification Section ────────────────────────────────────────────

type DeviceRow = Tables<'devices'>;

function DeviceClassificationSection({ devices: initial, isAdmin }: { devices: DeviceRow[]; isAdmin: boolean }) {
  const [devices, setDevices] = useState(initial);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft,   setDraft]   = useState<Partial<DeviceRow>>({});
  const [saving,  setSaving]  = useState(false);
  const [err,     setErr]     = useState<string | null>(null);

  function startEdit(d: DeviceRow) {
    setEditing(d.id);
    setDraft({ display_name: d.display_name, device_group: d.device_group, location: d.location, is_active: d.is_active });
    setErr(null);
  }
  function cancelEdit() { setEditing(null); setDraft({}); setErr(null); }

  async function save(id: string) {
    setSaving(true); setErr(null);
    const res = await updateDevice(id, {
      display_name: draft.display_name,
      device_group: draft.device_group,
      location:     draft.location,
      is_active:    draft.is_active,
    });
    setSaving(false);
    if (!res.ok) { setErr(res.error ?? 'Save failed'); return; }
    setDevices(prev => prev.map(d => d.id === id ? { ...d, ...draft } as DeviceRow : d));
    setEditing(null);
  }

  return (
    <div style={card()}>
      <div style={{ padding: '0.9rem 1.25rem', borderBottom: '1px solid var(--border)' }}>
        <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Device Classification</h3>
        <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: '0.15rem' }}>
          Device group assignment, display names, and active status.
        </p>
      </div>
      {err && (
        <div style={{ padding: '0.6rem 1.25rem', background: 'rgba(220,38,38,0.1)', color: 'var(--crit)', fontSize: 12 }}>
          {err}
        </div>
      )}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              {['Hostname', 'Display Name', 'Group', 'Location', 'Active', ''].map(h => (
                <th key={h} style={labelStyle()}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {devices.map(d => {
              const isEdit = editing === d.id;
              return (
                <tr key={d.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '0.55rem 1rem', fontFamily: 'monospace', fontSize: 11, color: 'var(--text-primary)' }}>
                    {d.hostname}
                  </td>
                  <td style={{ padding: '0.55rem 1rem', minWidth: 160 }}>
                    {isEdit ? (
                      <input value={draft.display_name ?? ''} style={inputStyle(false)}
                        onChange={e => setDraft(p => ({ ...p, display_name: e.target.value || null }))} />
                    ) : (
                      <span style={{ color: d.display_name ? 'var(--text-primary)' : 'var(--muted)' }}>
                        {d.display_name ?? '—'}
                      </span>
                    )}
                  </td>
                  <td style={{ padding: '0.55rem 1rem', minWidth: 120 }}>
                    {isEdit ? (
                      <select value={draft.device_group ?? ''} style={inputStyle(false)}
                        onChange={e => setDraft(p => ({ ...p, device_group: (e.target.value || null) as DeviceRow['device_group'] }))}>
                        <option value="">— none —</option>
                        {DEVICE_GROUPS.map(g => <option key={g} value={g}>{g}</option>)}
                      </select>
                    ) : (
                      <span style={{ color: d.device_group ? 'var(--text-primary)' : 'var(--muted)' }}>
                        {d.device_group ?? '—'}
                      </span>
                    )}
                  </td>
                  <td style={{ padding: '0.55rem 1rem', minWidth: 140 }}>
                    {isEdit ? (
                      <input value={draft.location ?? ''} style={inputStyle(false)}
                        onChange={e => setDraft(p => ({ ...p, location: e.target.value || null }))} />
                    ) : (
                      <span style={{ color: d.location ? 'var(--text-primary)' : 'var(--muted)' }}>
                        {d.location ?? '—'}
                      </span>
                    )}
                  </td>
                  <td style={{ padding: '0.55rem 1rem' }}>
                    {isEdit ? (
                      <input type="checkbox"
                        checked={draft.is_active ?? d.is_active}
                        style={{ accentColor: 'var(--accent)', width: 16, height: 16 }}
                        onChange={e => setDraft(p => ({ ...p, is_active: e.target.checked }))} />
                    ) : (
                      <span style={{ color: d.is_active ? 'var(--ok)' : 'var(--muted)' }}>
                        {d.is_active ? 'Yes' : 'No'}
                      </span>
                    )}
                  </td>
                  <td style={{ padding: '0.55rem 1rem', whiteSpace: 'nowrap' }}>
                    {isAdmin && (
                      isEdit ? (
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button style={btnStyle('primary', saving)} disabled={saving}
                            onClick={() => save(d.id)}>Save</button>
                          <button style={btnStyle('ghost')} onClick={cancelEdit}>Cancel</button>
                        </div>
                      ) : (
                        <button style={btnStyle('ghost')} onClick={() => startEdit(d)}>Edit</button>
                      )
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Notification Settings Section ────────────────────────────────────────────

function NotificationSettingsSection({ appSettings, isAdmin }: { appSettings: Record<string, unknown>; isAdmin: boolean }) {
  const [draft, setDraft] = useState<Record<string, string>>(() => {
    const d: Record<string, string> = {};
    for (const [k, v] of Object.entries(appSettings)) {
      d[k] = typeof v === 'string' ? v : JSON.stringify(v);
    }
    return d;
  });
  const [saving, setSaving] = useState(false);
  const [msg,    setMsg]    = useState<{ ok: boolean; text: string } | null>(null);

  const keys = Object.keys(draft);

  async function saveAll() {
    setSaving(true); setMsg(null);
    let allOk = true;
    for (const [key, val] of Object.entries(draft)) {
      let parsed: unknown = val;
      try { parsed = JSON.parse(val); } catch { /* keep as string */ }
      const res = await upsertAppSetting(key, parsed);
      if (!res.ok) allOk = false;
    }
    setSaving(false);
    setMsg(allOk ? { ok: true, text: 'Settings saved.' } : { ok: false, text: 'Some settings failed to save.' });
  }

  return (
    <div style={card()}>
      <div style={{ padding: '0.9rem 1.25rem', borderBottom: '1px solid var(--border)' }}>
        <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Notification Settings</h3>
        <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: '0.15rem' }}>
          Application-level configuration stored in the database.
        </p>
      </div>
      <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
        {keys.length === 0 && (
          <p style={{ color: 'var(--muted)', fontSize: 13 }}>No settings configured yet.</p>
        )}
        {keys.map(k => (
          <div key={k} style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
            <label style={{ fontSize: 12, color: 'var(--muted)', fontFamily: 'monospace', minWidth: 220 }}>{k}</label>
            <input
              value={draft[k]} disabled={!isAdmin}
              style={{ ...inputStyle(!isAdmin), maxWidth: 420, flex: 1 }}
              onChange={e => setDraft(d => ({ ...d, [k]: e.target.value }))}
            />
          </div>
        ))}
        {msg && (
          <p style={{ fontSize: 12, color: msg.ok ? 'var(--ok)' : 'var(--crit)', marginTop: '0.25rem' }}>
            {msg.text}
          </p>
        )}
        {isAdmin && keys.length > 0 && (
          <div>
            <button style={btnStyle('primary', saving)} disabled={saving} onClick={saveAll}>
              {saving ? 'Saving…' : 'Save settings'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Appearance Section ────────────────────────────────────────────────────────

function AppearanceSection() {
  return (
    <div style={card()}>
      <div style={{ padding: '0.9rem 1.25rem', borderBottom: '1px solid var(--border)' }}>
        <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Appearance</h3>
        <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: '0.15rem' }}>
          Choose between dark and light theme. Preference is saved in your browser.
        </p>
      </div>
      <div style={{ padding: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
        <span style={{ fontSize: 13, color: 'var(--text-primary)' }}>Color theme</span>
        <ThemeToggle size={15} />
      </div>
    </div>
  );
}

// ─── Main SettingsClient ───────────────────────────────────────────────────────

const TABS = [
  { key: 'alertRules',    label: 'Alert Rules'          },
  { key: 'devices',       label: 'Device Classification' },
  { key: 'notifSettings', label: 'Notification Settings' },
  { key: 'appearance',    label: 'Appearance'            },
] as const;
type TabKey = (typeof TABS)[number]['key'];

interface Props {
  isAdmin:     boolean;
  alertRules:  Tables<'alert_rules'>[];
  devices:     Tables<'devices'>[];
  appSettings: Record<string, unknown>;
}

export function SettingsClient({ isAdmin, alertRules, devices, appSettings }: Props) {
  const [activeTab, setActiveTab] = useState<TabKey>('alertRules');

  const tabBtn = (key: TabKey): React.CSSProperties => ({
    padding: '0.5rem 1rem', fontSize: 13, fontWeight: 600,
    borderRadius: 6, cursor: 'pointer', border: 'none',
    background: activeTab === key ? 'rgba(124,58,237,0.18)' : 'transparent',
    color:      activeTab === key ? 'var(--accent-text)'    : 'var(--muted)',
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {!isAdmin && (
        <div style={{
          padding: '0.65rem 1rem', borderRadius: 6,
          background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.25)',
          color: 'var(--warn)', fontSize: 13,
        }}>
          You are viewing settings in read-only mode. Contact an administrator to make changes.
        </div>
      )}

      <div style={{
        display: 'flex', gap: 4, flexWrap: 'wrap',
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 8, padding: '0.4rem',
      }}>
        {TABS.map(t => (
          <button key={t.key} style={tabBtn(t.key)} onClick={() => setActiveTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === 'alertRules'    && <AlertRulesSection rules={alertRules} isAdmin={isAdmin} />}
      {activeTab === 'devices'       && <DeviceClassificationSection devices={devices} isAdmin={isAdmin} />}
      {activeTab === 'notifSettings' && <NotificationSettingsSection appSettings={appSettings} isAdmin={isAdmin} />}
      {activeTab === 'appearance'    && <AppearanceSection />}
    </div>
  );
}
