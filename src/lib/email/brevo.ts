/**
 * Brevo (formerly Sendinblue) transactional email module.
 * All outbound email for DD Monitor goes through this single module.
 * BREVO_API_KEY and BREVO_FROM_EMAIL must be set in env.
 */
import 'server-only';
import { logger } from '@/lib/logger';

const BREVO_API = 'https://api.brevo.com/v3/smtp/email';

function getFromEmail(): string {
  return process.env.BREVO_FROM_EMAIL ?? 'noreply@dd-monitor.zain.iq';
}

async function sendEmail(payload: Record<string, unknown>): Promise<void> {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) throw new Error('BREVO_API_KEY is not configured');

  const res = await fetch(BREVO_API, {
    method: 'POST',
    headers: { 'api-key': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '(no body)');
    throw new Error(`Brevo API ${res.status}: ${detail}`);
  }
}

/** Send a 2FA verification code to the user's registered email address. */
export async function send2faCode(toEmail: string, code: string): Promise<void> {
  const ttlSeconds = Number(process.env.TWO_FACTOR_CODE_TTL_SECONDS ?? 60);
  const ttlLabel   = ttlSeconds >= 60
    ? `${ttlSeconds / 60} minute${ttlSeconds / 60 === 1 ? '' : 's'}`
    : `${ttlSeconds} seconds`;

  const html = `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /></head>
<body style="margin:0;padding:0;background:#09090B;font-family:system-ui,-apple-system,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#09090B;padding:40px 0;">
    <tr><td align="center">
      <table width="480" cellpadding="0" cellspacing="0"
             style="background:#131316;border:1px solid #27272A;border-radius:12px;overflow:hidden;">
        <tr>
          <td style="background:linear-gradient(135deg,#7C3AED,#A78BFA);padding:24px 32px;text-align:center;">
            <span style="font-size:13px;font-weight:700;color:#fff;letter-spacing:2px;">DD MONITOR</span>
            <p style="margin:4px 0 0;font-size:11px;color:rgba(255,255,255,0.7);">
              Zain Iraq · Backup infrastructure
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding:32px;text-align:center;">
            <h1 style="margin:0 0 8px;font-size:20px;font-weight:700;color:#FAFAFA;">
              Your sign-in code
            </h1>
            <p style="margin:0 0 28px;font-size:14px;color:#71717A;">
              Use this code to complete your sign-in. It expires in ${ttlLabel}.
            </p>
            <div style="display:inline-block;background:#09090B;border:2px solid #7C3AED;
                        border-radius:12px;padding:20px 40px;">
              <span style="font-family:monospace;font-size:36px;font-weight:700;
                           color:#A78BFA;letter-spacing:12px;">${code}</span>
            </div>
            <p style="margin:28px 0 0;font-size:12px;color:#52525B;">
              If you did not attempt to sign in, please secure your account immediately.
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding:16px 32px;border-top:1px solid #27272A;text-align:center;">
            <span style="font-size:11px;color:#52525B;">
              DD Monitor · Zain Iraq Internal System
            </span>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`.trim();

  const text =
    `DD Monitor sign-in code\n\n` +
    `Your verification code is: ${code}\n\n` +
    `This code expires in ${ttlLabel}.\n\n` +
    `If you did not attempt to sign in, please secure your account immediately.`;

  try {
    await sendEmail({
      sender:      { email: getFromEmail(), name: 'DD Monitor' },
      to:          [{ email: toEmail }],
      subject:     'Your DD Monitor sign-in code',
      htmlContent: html,
      textContent: text,
    });
  } catch (err) {
    logger.error('brevo', 'send2faCode failed', { err: String(err) });
    throw err;
  }
}
