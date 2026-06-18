import { redirect }            from 'next/navigation';
import { createSSRClient }     from '@/lib/db/client-ssr';
import {
  fetchAlertRulesAll,
  fetchAllDevices,
  fetchAppSettings,
}                              from '@/lib/db/queries';
import { SettingsClient }      from './SettingsClient';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const supabase = await createSSRClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: role } = await supabase.rpc('get_current_user_role');
  const isAdmin = role === 'admin';

  const [alertRules, devices, appSettings] = await Promise.all([
    fetchAlertRulesAll(supabase),
    fetchAllDevices(supabase),
    fetchAppSettings(supabase),
  ]);

  return (
    <div style={{ maxWidth: 1280, margin: '0 auto' }}>
      <div style={{ marginBottom: '1.25rem' }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
          Settings
        </h1>
        <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: '0.2rem' }}>
          System configuration and administration
        </p>
      </div>

      <SettingsClient
        isAdmin={isAdmin}
        alertRules={alertRules}
        devices={devices}
        appSettings={appSettings}
      />
    </div>
  );
}
