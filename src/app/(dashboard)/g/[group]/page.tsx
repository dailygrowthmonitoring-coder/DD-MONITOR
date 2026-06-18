import { notFound, redirect } from 'next/navigation';
import { createSSRClient }    from '@/lib/db/client-ssr';
import { isValidGroup }       from '@/lib/db/types';
import { FleetOverview }      from '@/components/dashboard/FleetOverview';

export const dynamic = 'force-dynamic';

export default async function GroupPage({
  params,
}: {
  params: Promise<{ group: string }>;
}) {
  const supabase = await createSSRClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { group } = await params;
  if (!isValidGroup(group)) notFound();

  return <FleetOverview group={group} />;
}
