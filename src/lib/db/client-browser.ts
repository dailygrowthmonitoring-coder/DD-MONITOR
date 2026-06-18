/**
 * Browser-safe Supabase client using @supabase/ssr.
 * Manages the auth session in cookies — must be used instead of the raw
 * @supabase/supabase-js createClient so that SSR session state is shared.
 */

import { createBrowserClient as ssrCreateBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './types';

/** Anon SSR-aware client for browser use. Session stored in cookies (RLS enforced). */
export function createBrowserClient(): SupabaseClient<Database> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY');
  }
  return ssrCreateBrowserClient<Database>(url, key);
}
