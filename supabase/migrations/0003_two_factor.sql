-- Migration 0003: two-factor authentication codes
-- Stores short-lived, hashed OTP codes used for the 2FA sign-in step.
-- Only the service role can read or write this table (no user-facing RLS policies).

CREATE TABLE public.two_factor_codes (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  code_hash   text        NOT NULL,
  salt        text        NOT NULL,
  expires_at  timestamptz NOT NULL,
  consumed    boolean     NOT NULL DEFAULT false,
  attempts    int         NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX two_factor_codes_user_id_idx   ON public.two_factor_codes (user_id);
CREATE INDEX two_factor_codes_expires_at_idx ON public.two_factor_codes (expires_at);

-- RLS on: service role bypasses it; no policies = no access for authenticated users
ALTER TABLE public.two_factor_codes ENABLE ROW LEVEL SECURITY;
