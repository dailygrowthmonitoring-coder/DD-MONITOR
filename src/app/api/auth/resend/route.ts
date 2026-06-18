/**
 * POST /api/auth/resend
 * Generates a fresh 2FA code and sends it to the user's email.
 * Requires the user to be signed in (Supabase session) and have an active
 * pending 2FA cookie. Updates the cookie to point at the new code row.
 *
 * Rate limit: shared with step1 — max 5 code rows per user per 10 minutes.
 */

import { createServerClient } from '@supabase/ssr';
import { NextRequest, NextResponse } from 'next/server';

import { createServiceRoleClient }              from '@/lib/db/client';
import { generateCode, generateSalt, hashCode,
         getCodeTtlSeconds,
         MAX_RESENDS_PER_WINDOW,
         RESEND_WINDOW_SECONDS }                from '@/lib/auth/twoFactor';
import { send2faCode }                          from '@/lib/email/brevo';
import { logger }                               from '@/lib/logger';

const PENDING_COOKIE = 'x-dd-2fa-pending';

export async function POST(request: NextRequest) {
  const pendingId = request.cookies.get(PENDING_COOKIE)?.value;
  if (!pendingId) {
    return NextResponse.json(
      { ok: false, error: { code: 'NO_PENDING', message: 'No 2FA session. Please sign in again.' } },
      { status: 400 },
    );
  }

  // Verify session
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: () => {},
      },
    },
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: { code: 'UNAUTHORIZED', message: 'Session expired. Please sign in again.' } },
      { status: 401 },
    );
  }

  const userId = user.id;
  const db     = createServiceRoleClient();

  // Rate-limit
  const windowStart = new Date(Date.now() - RESEND_WINDOW_SECONDS * 1000).toISOString();
  const { count } = await db
    .from('two_factor_codes')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', windowStart);

  if ((count ?? 0) >= MAX_RESENDS_PER_WINDOW) {
    return NextResponse.json(
      { ok: false, error: { code: 'RATE_LIMITED', message: 'Too many code requests. Please wait before resending.' } },
      { status: 429 },
    );
  }

  // Get the user's email from Supabase admin
  const { data: adminUser } = await db.auth.admin.getUserById(userId);
  const userEmail = adminUser?.user?.email;
  if (!userEmail) {
    logger.error('auth/resend', 'could not resolve user email', { userId });
    return NextResponse.json(
      { ok: false, error: { code: 'SERVER_ERROR', message: 'Could not resolve your email address.' } },
      { status: 500 },
    );
  }

  // Generate and store new code
  const code       = generateCode();
  const salt       = generateSalt();
  const codeHash   = hashCode(code, salt);
  const ttlSeconds = getCodeTtlSeconds();
  const expiresAt  = new Date(Date.now() + ttlSeconds * 1000).toISOString();

  const { data: inserted, error: insertError } = await db
    .from('two_factor_codes')
    .insert({ user_id: userId, code_hash: codeHash, salt, expires_at: expiresAt })
    .select('id')
    .single();

  if (insertError || !inserted) {
    logger.error('auth/resend', 'insert failed', { userId, err: String(insertError) });
    return NextResponse.json(
      { ok: false, error: { code: 'SERVER_ERROR', message: 'Could not generate a new code.' } },
      { status: 500 },
    );
  }

  try {
    await send2faCode(userEmail, code);
  } catch (emailErr) {
    logger.error('auth/resend', 'email failed', { userId, err: String(emailErr) });
    return NextResponse.json(
      { ok: false, error: { code: 'EMAIL_FAILED', message: 'Failed to send email. Please try again.' } },
      { status: 502 },
    );
  }

  const response = NextResponse.json({ ok: true, ttlSeconds });
  const secure   = process.env.NODE_ENV === 'production';
  response.cookies.set(PENDING_COOKIE, inserted.id, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path:     '/',
    maxAge:   RESEND_WINDOW_SECONDS,
  });

  logger.info('auth/resend', 'new 2FA code sent', { userId });
  return response;
}
