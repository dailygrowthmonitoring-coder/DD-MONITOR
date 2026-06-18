/** Password policy — pure function, no I/O. Used by both client forms and server routes. */

export type PolicyRule = 'minLength' | 'uppercase' | 'lowercase' | 'digit' | 'symbol';

export interface PolicyViolation {
  rule: PolicyRule;
  message: string;
}

export interface PolicyResult {
  valid: boolean;
  violations: PolicyViolation[];
}

/** The four accepted special characters. Only these count toward the symbol requirement. */
export const ALLOWED_SYMBOLS = '$!&)';

const CHECKS: Array<{ rule: PolicyRule; message: string; test: (p: string) => boolean }> = [
  { rule: 'minLength', message: 'At least 10 characters',              test: p => p.length >= 10      },
  { rule: 'uppercase', message: 'At least one uppercase letter (A–Z)', test: p => /[A-Z]/.test(p)    },
  { rule: 'lowercase', message: 'At least one lowercase letter (a–z)', test: p => /[a-z]/.test(p)    },
  { rule: 'digit',     message: 'At least one digit (0–9)',            test: p => /[0-9]/.test(p)    },
  { rule: 'symbol',    message: 'At least one symbol ($, !, &, or )', test: p => /[$!&)]/.test(p)   },
];

/** Validate a password against the policy. Returns all violations at once. */
export function checkPasswordPolicy(password: string): PolicyResult {
  const violations = CHECKS
    .filter(c => !c.test(password))
    .map(({ rule, message }) => ({ rule, message }));
  return { valid: violations.length === 0, violations };
}
