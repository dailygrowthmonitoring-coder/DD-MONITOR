import { redirect }           from 'next/navigation';
import { createSSRClient }    from '@/lib/db/client-ssr';
import { fetchAlertsCenter }  from '@/lib/db/queries';
import { AlertsClient }       from './AlertsClient';

export const dynamic = 'force-dynamic';

export default async function AlertsPage() {
  const supabase = await createSSRClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { deviceAlerts, notifications } = await fetchAlertsCenter(supabase);

  return (
    <div style={{ maxWidth: 1280, margin: '0 auto' }}>
      <div style={{ marginBottom: '1.25rem' }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
          Alerts Center
        </h1>
        <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: '0.2rem' }}>
          Active device alerts and system notifications across the fleet
        </p>
      </div>

      <AlertsClient deviceAlerts={deviceAlerts} notifications={notifications} />
    </div>
  );
}
