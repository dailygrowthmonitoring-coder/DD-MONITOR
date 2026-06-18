import { describe, it, expect } from 'vitest';
import { checkPasswordPolicy } from '../passwordPolicy';

describe('checkPasswordPolicy', () => {
  it('accepts a fully compliant password', () => {
    const r = checkPasswordPolicy('Str0ng$Pass1');
    expect(r.valid).toBe(true);
    expect(r.violations).toHaveLength(0);
  });

  it('rejects a password shorter than 10 characters', () => {
    const r = checkPasswordPolicy('Ab1$');
    expect(r.valid).toBe(false);
    expect(r.violations.some(v => v.rule === 'minLength')).toBe(true);
  });

  it('passes length check for exactly 10 characters', () => {
    const r = checkPasswordPolicy('Ab1$cdefgh');
    expect(r.violations.some(v => v.rule === 'minLength')).toBe(false);
  });

  it('rejects a password with no uppercase letter', () => {
    const r = checkPasswordPolicy('str0ng$pass1');
    expect(r.valid).toBe(false);
    expect(r.violations.some(v => v.rule === 'uppercase')).toBe(true);
  });

  it('rejects a password with no lowercase letter', () => {
    const r = checkPasswordPolicy('STR0NG$PASS1');
    expect(r.valid).toBe(false);
    expect(r.violations.some(v => v.rule === 'lowercase')).toBe(true);
  });

  it('rejects a password with no digit', () => {
    const r = checkPasswordPolicy('Strong$Password');
    expect(r.valid).toBe(false);
    expect(r.violations.some(v => v.rule === 'digit')).toBe(true);
  });

  it('rejects a password with no allowed symbol', () => {
    const r = checkPasswordPolicy('Strong1Password');
    expect(r.valid).toBe(false);
    expect(r.violations.some(v => v.rule === 'symbol')).toBe(true);
  });

  it('rejects a password that only has disallowed symbols (@, #, %)', () => {
    const r = checkPasswordPolicy('Strong1Password@#%');
    expect(r.violations.some(v => v.rule === 'symbol')).toBe(true);
  });

  it('accepts the allowed symbol $', () => {
    expect(checkPasswordPolicy('Str0ng$Passw').valid).toBe(true);
  });

  it('accepts the allowed symbol !', () => {
    expect(checkPasswordPolicy('Str0ng!Passw').valid).toBe(true);
  });

  it('accepts the allowed symbol &', () => {
    expect(checkPasswordPolicy('Str0ng&Passw').valid).toBe(true);
  });

  it('accepts the allowed symbol )', () => {
    expect(checkPasswordPolicy('Str0ng)Passw').valid).toBe(true);
  });

  it('returns multiple violations simultaneously', () => {
    const r = checkPasswordPolicy('weak');
    expect(r.violations.length).toBeGreaterThan(1);
    expect(r.valid).toBe(false);
  });

  it('rejects empty string with all 5 violations', () => {
    const r = checkPasswordPolicy('');
    expect(r.violations).toHaveLength(5);
    expect(r.valid).toBe(false);
  });

  it('violation messages are non-empty strings', () => {
    const r = checkPasswordPolicy('bad');
    for (const v of r.violations) {
      expect(typeof v.message).toBe('string');
      expect(v.message.length).toBeGreaterThan(0);
    }
  });
});
