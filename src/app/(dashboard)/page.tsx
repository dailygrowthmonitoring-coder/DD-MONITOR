import { redirect }        from 'next/navigation';
import { createSSRClient } from '@/lib/db/client-ssr';
import { FleetOverview }   from '@/components/dashboard/FleetOverview';

export const dynamic = 'force-dynamic';

export default async function FleetPage() {
  const supabase = await createSSRClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  return <FleetOverview />;
}
