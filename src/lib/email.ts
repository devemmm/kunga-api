/**
 * Resend email helper for Kunga Basics.
 * Docs: https://resend.com/docs/api-reference/emails/send-email
 *
 * All send functions are fire-and-forget safe — they never throw,
 * but log failures so email issues are visible in server logs.
 */

import { Resend } from 'resend';
import { config } from '../config/index.js';

const resend = new Resend(config.resend.apiKey);
const FROM   = config.resend.fromEmail; // e.g. "Kunga Basics <noreply@kungabasics.com>"

// ─── Shared layout wrapper ────────────────────────────────────────────────────

function layout(title: string, body: string): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:32px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
        <!-- Header -->
        <tr>
          <td style="background:#0d3b36;padding:28px 32px;">
            <span style="font-size:24px;font-weight:700;color:#ffffff;letter-spacing:-0.5px;">
              🌿 Kunga Basics
            </span>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:32px;color:#374151;font-size:15px;line-height:1.7;">
            ${body}
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="padding:20px 32px;border-top:1px solid #f3f4f6;font-size:12px;color:#9ca3af;text-align:center;">
            Kunga Basics · Helping parents support children with developmental challenges<br/>
            You're receiving this because you have an account at kungabasics.com
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ─── Password reset ───────────────────────────────────────────────────────────

export async function sendPasswordResetEmail(
  to: string,
  name: string,
  resetToken: string,
): Promise<void> {
  const resetUrl = `${config.app.deepLinkScheme}://reset-password?token=${resetToken}`;
  // Also provide a web fallback in case deep link doesn't open
  const webUrl = `https://app.kungabasics.com/reset-password?token=${resetToken}`;

  const html = layout('Reset your Kunga Basics password', `
    <p>Hi ${name || 'there'},</p>
    <p>We received a request to reset your Kunga Basics password.
       Tap the button below — the link expires in <strong>1 hour</strong>.</p>
    <p style="text-align:center;margin:28px 0;">
      <a href="${webUrl}"
         style="background:#0d9488;color:#ffffff;padding:14px 32px;border-radius:8px;
                text-decoration:none;font-weight:600;font-size:15px;display:inline-block;">
        Reset my password
      </a>
    </p>
    <p style="font-size:13px;color:#6b7280;">
      If the button doesn't work, copy and paste this link into your browser:<br/>
      <a href="${webUrl}" style="color:#0d9488;word-break:break-all;">${webUrl}</a>
    </p>
    <p style="font-size:13px;color:#6b7280;">
      If you didn't request this, you can safely ignore this email —
      your password will not change.
    </p>
  `);

  try {
    const { error } = await resend.emails.send({
      from:    FROM,
      to:      [to],
      subject: 'Reset your Kunga Basics password',
      html,
    });
    if (error) console.error('[Email] Password reset send failed:', error);
    else       console.log(`[Email] Password reset sent to ${to}`);
  } catch (err) {
    console.error('[Email] Network error sending password reset:', err);
  }
}

// ─── Admin → user direct email ────────────────────────────────────────────────

export async function sendAdminEmail(
  to: string,
  userName: string,
  subject: string,
  message: string,
): Promise<void> {
  // Convert plain-text line breaks to HTML paragraphs
  const paragraphs = message
    .split(/\n{2,}/)
    .map(p => `<p>${p.replace(/\n/g, '<br/>')}</p>`)
    .join('');

  const html = layout(subject, `
    <p>Hi ${userName || 'there'},</p>
    ${paragraphs}
    <p style="margin-top:28px;">Warm regards,<br/>
       <strong>The Kunga Basics Team</strong></p>
  `);

  try {
    const { error } = await resend.emails.send({
      from:    FROM,
      to:      [to],
      subject,
      html,
    });
    if (error) console.error('[Email] Admin email send failed:', error);
    else       console.log(`[Email] Admin email "${subject}" sent to ${to}`);
  } catch (err) {
    console.error('[Email] Network error sending admin email:', err);
  }
}

// ─── Welcome email (called after registration) ────────────────────────────────

export async function sendWelcomeEmail(to: string, name: string): Promise<void> {
  const html = layout('Welcome to Kunga Basics! 🌿', `
    <p>Hi ${name || 'there'},</p>
    <p>Welcome to <strong>Kunga Basics</strong> — we're so glad you're here. 💚</p>
    <p>Here's what you can do right away:</p>
    <ul style="padding-left:20px;line-height:2;">
      <li>📚 Browse our therapy modules</li>
      <li>📅 Set up your child's daily routine</li>
      <li>🏆 Track weekly milestones</li>
      <li>🎤 Ask Dr. Gad a question</li>
    </ul>
    <p style="text-align:center;margin:28px 0;">
      <a href="https://app.kungabasics.com"
         style="background:#0d9488;color:#ffffff;padding:14px 32px;border-radius:8px;
                text-decoration:none;font-weight:600;font-size:15px;display:inline-block;">
        Open the app
      </a>
    </p>
    <p>If you have any questions, just reply to this email — we read every message.</p>
    <p>Warm regards,<br/><strong>The Kunga Basics Team</strong></p>
  `);

  try {
    const { error } = await resend.emails.send({
      from:    FROM,
      to:      [to],
      subject: 'Welcome to Kunga Basics! 🌿',
      html,
    });
    if (error) console.error('[Email] Welcome email send failed:', error);
    else       console.log(`[Email] Welcome email sent to ${to}`);
  } catch (err) {
    console.error('[Email] Network error sending welcome email:', err);
  }
}
