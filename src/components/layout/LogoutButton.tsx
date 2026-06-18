'use client';
import { useRouter } from 'next/navigation';
import { LogOut } from 'lucide-react';
import { createBrowserClient } from '@/lib/db/client-browser';

export function LogoutButton() {
  const router = useRouter();

  async function handleLogout() {
    const supabase = createBrowserClient();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  return (
    <button
      onClick={handleLogout}
      title="Sign out"
      style={{
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        color: 'var(--muted)',
        display: 'flex',
        alignItems: 'center',
        padding: '0.35rem',
        borderRadius: 4,
      }}
    >
      <LogOut size={15} />
    </button>
  );
}
