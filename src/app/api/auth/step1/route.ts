/**
 * POST /api/auth/step1
 * Verifies email + password via Supabase and initiates the 2FA flow.
 *
 * On success:
 *   - Supabase session cookies are set on the response.
 *   - A hashed 6-digit code is stored in two_factor_codes.
 *   - The code is emailed to the user's registered address via Brevo.
 *   - An httpOnly `x-dd-2fa-pending` cookie is set with the row ID.
 *
 * Rate limit: max 5 code-generation attempts per user per 10 minutes.
 */

import { createServerClient } from '@supabase/ssr';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { createServiceRoleClient }               from '@/lib/db/client';
import { generateCode, generateSalt, hashCode,
         getCodeTtlSeconds,
         MAX_RESENDS_PER_WINDOW,
         RESEND_WINDOW_SECONDS }                 from '@/lib/auth/twoFactor';
import { send2faCode }                           from '@/lib/email/brevo';
import { logger }                                from '@/lib/logger';

const bodySchema = z.object({
  email:    z.string().email(),
  password: z.string().min(1),
});

const PENDING_COOKIE = 'x-dd-2fa-pending';

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: { code: 'INVALID_BODY', message: 'email and password are required' } },
      { status: 400 },
    );
  }

  const { email, password } = parsed.data;

  // Collect Supabase session cookies so we can forward them to the browser
  const pendingCookies: Array<{ name: string; value: string; options: Record<string, unknown> }> = [];

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookies) => {
          pendingCookies.push(...cookies as typeof pendingCookies);
        },
      },
    },
  );

  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (authError || !authData.user) {
    return NextResponse.json(
      { ok: false, error: { code: 'UNAUTHORIZED', message: 'Invalid email or password' } },
      { status: 401 },
    );
  }

  const userId    = authData.user.id;
  const userEmail = authData.user.email ?? email;

  // Rate-limit check: count code requests in the last RESEND_WINDOW_SECONDS
  const db = createServiceRoleClient();
  const windowStart = new Date(Date.now() - RESEND_WINDOW_SECONDS * 1000).toISOString();
  const { count, error: countError } = await db
    .from('two_factor_codes')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', windowStart);

  if (countError) {
    logger.error('auth/step1', 'rate-limit check failed', { userId, err: String(countError) });
    return NextResponse.json(
      { ok: false, error: { code: 'SERVER_ERROR', message: 'Verification unavailable. Please try again.' } },
      { status: 500 },
    );
  }

  if ((count ?? 0) >= MAX_RESENDS_PER_WINDOW) {
    return NextResponse.json(
      { ok: false, error: { code: 'RATE_LIMITED', message: 'Too many code requests. Please wait 10 minutes.' } },
      { status: 429 },
    );
  }

  // Generate and store the code
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
    logger.error('auth/step1', 'code insert failed', { userId, err: String(insertError) });
    return NextResponse.json(
      { ok: false, error: { code: 'SERVER_ERROR', message: 'Could not generate verification code.' } },
      { status: 500 },
    );
  }

  // Send the code — if email fails we still return an error (don't leave user stuck)
  try {
    await send2faCode(userEmail, code);
  } catch (emailErr) {
    logger.error('auth/step1', 'brevo send failed', { userId, err: String(emailErr) });
    return NextResponse.json(
      { ok: false, error: { code: 'EMAIL_FAILED', message: 'Failed to send verification email. Please try again.' } },
      { status: 502 },
    );
  }

  // Build response — set Supabase session cookies + pending 2FA cookie
  const response = NextResponse.json({ ok: true, ttlSeconds });

  for (const { name, value, options } of pendingCookies) {
    response.cookies.set(name, value, options as Parameters<typeof response.cookies.set>[2]);
  }

  const secure = process.env.NODE_ENV === 'production';
  response.cookies.set(PENDING_COOKIE, inserted.id, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path:     '/',
    maxAge:   RESEND_WINDOW_SECONDS, // cookie lives as long as the resend window
  });

  logger.info('auth/step1', '2FA code sent', { userId });
  return response;
}
