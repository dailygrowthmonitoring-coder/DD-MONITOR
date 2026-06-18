import { redirect }         from 'next/navigation';
import { createSSRClient } from '@/lib/db/client-ssr';
import { UsersClient }     from './UsersClient';

export const dynamic = 'force-dynamic';

export default async function UsersPage() {
  const supabase = await createSSRClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: role } = await supabase.rpc('get_current_user_role');
  const isAdmin = role === 'admin';

  return (
    <div style={{ maxWidth: 1280, margin: '0 auto' }}>
      <div style={{ marginBottom: '1.25rem' }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
          User Management
        </h1>
        <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: '0.2rem' }}>
          Accounts, roles, and access control
        </p>
      </div>

      {isAdmin ? (
        <UsersClient currentUserId={user.id} />
      ) : (
        <div style={{
          padding: '2rem 1.5rem', borderRadius: 8,
          background: 'var(--surface)', border: '1px solid var(--border)',
          color: 'var(--muted)', fontSize: 13, textAlign: 'center',
        }}>
          Admin role required to manage users.
        </div>
      )}
    </div>
  );
}
