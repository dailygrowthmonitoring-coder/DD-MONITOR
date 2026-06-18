/**
 * Two-factor authentication helpers — pure functions, no I/O.
 * Code generation, hashing, and verification are all deterministic and testable
 * without a database or email dependency.
 */

import { createHash, randomBytes, timingSafeEqual } from 'crypto';

export const TWO_FACTOR_CODE_LENGTH = 6;
export const MAX_ATTEMPTS           = 5;
export const MAX_RESENDS_PER_WINDOW = 5;
export const RESEND_WINDOW_SECONDS  = 600; // 10 minutes

/** Default TTL in seconds; override via TWO_FACTOR_CODE_TTL_SECONDS env var. */
export function getCodeTtlSeconds(): number {
  const v = Number(process.env.TWO_FACTOR_CODE_TTL_SECONDS);
  return Number.isFinite(v) && v > 0 ? v : 60;
}

/**
 * Generate a cryptographically random 6-digit code.
 * Uses rejection sampling on 4 random bytes to avoid modulo bias.
 */
export function generateCode(): string {
  const MAX_SAFE = Math.floor(0xffffffff / 1_000_000) * 1_000_000;
  let n: number;
  do {
    n = randomBytes(4).readUInt32BE(0);
  } while (n >= MAX_SAFE);
  return (n % 1_000_000).toString().padStart(TWO_FACTOR_CODE_LENGTH, '0');
}

/** Generate a random 32-byte hex salt. */
export function generateSalt(): string {
  return randomBytes(32).toString('hex');
}

/** Hash a code with its per-row salt using SHA-256. */
export function hashCode(code: string, salt: string): string {
  return createHash('sha256').update(`${code}:${salt}`).digest('hex');
}

/** Constant-time code verification to prevent timing attacks. */
export function verifyCode(code: string, salt: string, storedHash: string): boolean {
  const candidate = hashCode(code, salt);
  const a = Buffer.from(candidate,   'hex');
  const b = Buffer.from(storedHash,  'hex');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
