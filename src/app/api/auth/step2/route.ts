/**
 * POST /api/auth/step2
 * Verifies the 6-digit 2FA code and completes sign-in.
 *
 * Reads `x-dd-2fa-pending` cookie to locate the pending code row.
 * On success: marks the code consumed and clears the pending cookie.
 * On failure: increments the attempt counter; locks after MAX_ATTEMPTS.
 */

import { createServerClient } from '@supabase/ssr';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { createServiceRoleClient }            from '@/lib/db/client';
import { verifyCode, MAX_ATTEMPTS }           from '@/lib/auth/twoFactor';
import { logger }                             from '@/lib/logger';

const bodySchema = z.object({
  code: z.string().regex(/^\d{6}$/),
});

const PENDING_COOKIE = 'x-dd-2fa-pending';

export async function POST(request: NextRequest) {
  const pendingId = request.cookies.get(PENDING_COOKIE)?.value;
  if (!pendingId) {
    return NextResponse.json(
      { ok: false, error: { code: 'NO_PENDING', message: 'No 2FA session found. Please sign in again.' } },
      { status: 400 },
    );
  }

  const body   = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: { code: 'INVALID_CODE', message: 'Code must be exactly 6 digits.' } },
      { status: 400 },
    );
  }

  const { code } = parsed.data;

  // Verify authenticated user matches the pending row
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

  const db = createServiceRoleClient();

  // Fetch the pending row
  const { data: row, error: fetchErr } = await db
    .from('two_factor_codes')
    .select('id, user_id, code_hash, salt, expires_at, consumed, attempts')
    .eq('id', pendingId)
    .single();

  if (fetchErr || !row) {
    return NextResponse.json(
      { ok: false, error: { code: 'CODE_NOT_FOUND', message: 'Verification code not found. Please resend.' } },
      { status: 400 },
    );
  }

  // Security: session user must match the code's owner
  if (row.user_id !== user.id) {
    logger.warn('auth/step2', 'user_id mismatch', { userId: user.id, codeOwner: row.user_id });
    return NextResponse.json(
      { ok: false, error: { code: 'UNAUTHORIZED', message: 'Verification failed.' } },
      { status: 401 },
    );
  }

  if (row.consumed) {
    return NextResponse.json(
      { ok: false, error: { code: 'CODE_CONSUMED', message: 'This code has already been used. Please resend.' } },
      { status: 400 },
    );
  }

  if (new Date(row.expires_at) < new Date()) {
    return NextResponse.json(
      { ok: false, error: { code: 'CODE_EXPIRED', message: 'Code expired. Please resend.' } },
      { status: 400 },
    );
  }

  if (row.attempts >= MAX_ATTEMPTS) {
    return NextResponse.json(
      { ok: false, error: { code: 'CODE_LOCKED', message: 'Too many incorrect attempts. Please resend a new code.' } },
      { status: 429 },
    );
  }

  // Increment attempt counter first (prevent race conditions)
  const newAttempts = row.attempts + 1;
  await db.from('two_factor_codes').update({ attempts: newAttempts }).eq('id', pendingId);

  if (!verifyCode(code, row.salt, row.code_hash)) {
    const remaining = MAX_ATTEMPTS - newAttempts;
    return NextResponse.json(
      {
        ok: false,
        error: {
          code:     remaining <= 0 ? 'CODE_LOCKED' : 'WRONG_CODE',
          message:  remaining <= 0
            ? 'Too many incorrect attempts. Please resend a new code.'
            : `Incorrect code. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`,
          attemptsRemaining: remaining,
        },
      },
      { status: 400 },
    );
  }

  // Correct — mark consumed and clear the pending cookie
  await db.from('two_factor_codes').update({ consumed: true }).eq('id', pendingId);

  const response = NextResponse.json({ ok: true });
  response.cookies.set(PENDING_COOKIE, '', {
    httpOnly: true,
    secure:   process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path:     '/',
    maxAge:   0,
  });

  logger.info('auth/step2', '2FA verified', { userId: user.id });
  return response;
}
