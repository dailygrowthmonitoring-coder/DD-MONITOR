import { redirect } from 'next/navigation';
import { cookies }  from 'next/headers';
import { Sidebar }  from '@/components/layout/Sidebar';
import { Topbar }   from '@/components/layout/Topbar';
import { createSSRClient } from '@/lib/db/client-ssr';

const W_COLLAPSED = 56;
const W_EXPANDED  = 210;

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createSSRClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, role')
    .eq('user_id', user.id)
    .single();

  const fullName = profile?.full_name ?? user.email ?? '';
  const initials = fullName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w: string) => w[0].toUpperCase())
    .join('') || (user.email?.[0].toUpperCase() ?? '?');
  const role = profile?.role ?? 'viewer';

  // Read sidebar state from cookie so server render matches the client's last choice
  const cookieStore      = await cookies();
  const sidebarCollapsed = cookieStore.get('dd-sidebar')?.value !== 'expanded';
  const sidebarWidth     = sidebarCollapsed ? W_COLLAPSED : W_EXPANDED;

  return (
    <>
      {/*
        Inline script sets --sidebar-w before first paint so the topbar and
        main content margin match the sidebar without a layout flash.
      */}
      <script
        dangerouslySetInnerHTML={{
          __html: `document.documentElement.style.setProperty('--sidebar-w','${sidebarWidth}px')`,
        }}
      />

      <Sidebar initialCollapsed={sidebarCollapsed} />
      <Topbar userInitials={initials} userRole={role} />

      <main style={{
        marginLeft:  'var(--sidebar-w, 56px)',
        marginTop:   52,
        minHeight:   'calc(100vh - 52px)',
        background:  'var(--bg)',
        padding:     '1.5rem',
        transition:  'margin-left 0.2s ease',
      }}>
        {children}
      </main>
    </>
  );
}
