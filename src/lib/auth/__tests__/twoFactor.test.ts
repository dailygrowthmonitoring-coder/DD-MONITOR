import { describe, it, expect } from 'vitest';
import {
  generateCode,
  generateSalt,
  hashCode,
  verifyCode,
  TWO_FACTOR_CODE_LENGTH,
} from '../twoFactor';

describe('generateCode', () => {
  it('returns a string of exactly 6 digits', () => {
    const code = generateCode();
    expect(code).toMatch(/^\d{6}$/);
    expect(code).toHaveLength(TWO_FACTOR_CODE_LENGTH);
  });

  it('pads with leading zeros when value is < 100000', () => {
    // Run enough iterations to statistically encounter a small value
    const codes = Array.from({ length: 200 }, generateCode);
    expect(codes.every(c => c.length === 6 && /^\d{6}$/.test(c))).toBe(true);
  });

  it('produces different values across calls (basic uniqueness)', () => {
    const codes = new Set(Array.from({ length: 20 }, generateCode));
    expect(codes.size).toBeGreaterThan(1);
  });
});

describe('generateSalt', () => {
  it('returns a 64-character lowercase hex string', () => {
    expect(generateSalt()).toMatch(/^[0-9a-f]{64}$/);
  });

  it('generates unique salts across calls', () => {
    const salts = new Set(Array.from({ length: 10 }, generateSalt));
    expect(salts.size).toBe(10);
  });
});

describe('hashCode', () => {
  it('is deterministic for the same code and salt', () => {
    const salt = generateSalt();
    expect(hashCode('123456', salt)).toBe(hashCode('123456', salt));
  });

  it('produces different hashes for different codes (same salt)', () => {
    const salt = generateSalt();
    expect(hashCode('000001', salt)).not.toBe(hashCode('000002', salt));
  });

  it('produces different hashes for the same code with different salts', () => {
    const s1 = generateSalt();
    const s2 = generateSalt();
    expect(hashCode('999999', s1)).not.toBe(hashCode('999999', s2));
  });

  it('returns a 64-character hex string (SHA-256 output)', () => {
    const hash = hashCode('000000', generateSalt());
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('verifyCode — happy path', () => {
  it('returns true for the correct code and salt', () => {
    const salt = generateSalt();
    const code = '427391';
    const hash = hashCode(code, salt);
    expect(verifyCode(code, salt, hash)).toBe(true);
  });

  it('works with a generated code end-to-end', () => {
    const code = generateCode();
    const salt = generateSalt();
    const hash = hashCode(code, salt);
    expect(verifyCode(code, salt, hash)).toBe(true);
  });
});

describe('verifyCode — failure cases', () => {
  it('returns false for a wrong code', () => {
    const salt = generateSalt();
    const hash = hashCode('123456', salt);
    expect(verifyCode('654321', salt, hash)).toBe(false);
  });

  it('returns false when salt does not match', () => {
    const s1 = generateSalt();
    const s2 = generateSalt();
    const hash = hashCode('123456', s1);
    expect(verifyCode('123456', s2, hash)).toBe(false);
  });

  it('returns false for an off-by-one code', () => {
    const salt = generateSalt();
    const hash = hashCode('100000', salt);
    expect(verifyCode('100001', salt, hash)).toBe(false);
  });

  it('returns false when storedHash is corrupted', () => {
    const salt = generateSalt();
    const hash = hashCode('000000', salt);
    const corrupted = hash.slice(0, -1) + (hash.endsWith('0') ? '1' : '0');
    expect(verifyCode('000000', salt, corrupted)).toBe(false);
  });
});
