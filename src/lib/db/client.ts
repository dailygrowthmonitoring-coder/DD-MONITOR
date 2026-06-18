/**
 * Server-only Supabase client factory.
 * The `server-only` import causes a build-time error if this module is ever
 * bundled into a client (browser) chunk, preventing the service role key leak.
 */
import 'server-only';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './types';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

/**
 * Service-role client — bypasses RLS. Used exclusively by the ingest API
 * and internal server operations. Never pass this client to any client component.
 */
export function createServiceRoleClient(): SupabaseClient<Database> {
  return createClient<Database>(
    requireEnv('SUPABASE_URL'),
    requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

/**
 * Anon client — respects RLS. Used by RSC data-fetching helpers that read
 * on behalf of an authenticated session. Session management is handled at
 * the route level (Phase 4).
 */
export function createAnonClient(): SupabaseClient<Database> {
  return createClient<Database>(
    requireEnv('SUPABASE_URL'),
    requireEnv('SUPABASE_ANON_KEY'),
  );
}
