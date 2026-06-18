/**
 * SSR Supabase client for React Server Components and server actions.
 * Uses the anon key + cookie-based session — RLS is enforced as the
 * authenticated user. Never passes the service role key to the browser.
 */
import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { Database } from './types';

export async function createSSRClient() {
  const cookieStore = await cookies();
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        // RSC is read-only; middleware handles session refresh
        setAll: () => {},
      },
    },
  );
}
