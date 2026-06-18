import { createServerClient } from '@supabase/ssr';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const PENDING_COOKIE = 'x-dd-2fa-pending';

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Refresh session — required by @supabase/ssr
  const { data: { user } } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const pending2fa   = request.cookies.get(PENDING_COOKIE)?.value;

  // All /api/ routes handle their own authentication; let them through unconditionally.
  if (pathname.startsWith('/api/')) return supabaseResponse;

  if (!user) {
    // Unauthenticated: only /login is accessible
    if (pathname === '/login') return supabaseResponse;
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // Authenticated user with a pending 2FA cookie — must complete 2FA first
  if (pending2fa) {
    if (pathname === '/login/verify') return supabaseResponse;
    // Allow navigating back to /login (to restart), but redirect everything else
    if (pathname === '/login') return supabaseResponse;
    return NextResponse.redirect(new URL('/login/verify', request.url));
  }

  // Fully authenticated — push away from auth pages
  if (pathname === '/login' || pathname === '/login/verify') {
    return NextResponse.redirect(new URL('/', request.url));
  }

  return supabaseResponse;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
