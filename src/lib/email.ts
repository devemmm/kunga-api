/**
 * Email helper for Kunga Basics — powered by Nodemailer (SMTP).
 *
 * Transport: mail.devemm.rw:587 with STARTTLS
 *
 * All send functions are fire-and-forget safe — they never throw,
 * but log failures so email issues are visible in server logs.
 */

import nodemailer from 'nodemailer';
import { config } from '../config/index.js';

// ─── SMTP Transport ───────────────────────────────────────────────────────────

const transporter = nodemailer.createTransport({
  host:   config.smtp.host,
  port:   config.smtp.port,
  secure: false,          // false = STARTTLS on port 587
  auth: {
    user: config.smtp.user,
    pass: config.smtp.password,
  },
  tls: {
    rejectUnauthorized: false, // allow self-signed certs on private mail servers
  },
});

const FROM = config.smtp.from; // e.g. "Kunga Basics <noreply@devemm.rw>"

// ─── Shared HTML layout ───────────────────────────────────────────────────────

function layout(title: string, body: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:32px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0"
             style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
        <!-- Header -->
        <tr>
          <td style="background:#0d3b36;padding:24px 32px;">
            <table cellpadding="0" cellspacing="0"><tr>
              <td style="vertical-align:middle;padding-right:10px;">
                <img src="https://kungabasics.com/icon.png" alt="Kunga Basics"
                     width="32" height="32" style="display:block;border-radius:6px;" />
              </td>
              <td style="vertical-align:middle;">
                <span style="font-size:24px;font-weight:700;color:#ffffff;letter-spacing:-0.5px;">
                  Kunga Basics
                </span>
              </td>
            </tr></table>
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
          <td style="padding:20px 32px;border-top:1px solid #f3f4f6;font-size:12px;
                     color:#9ca3af;text-align:center;">
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

// ─── Internal send helper ─────────────────────────────────────────────────────

async function send(to: string, subject: string, html: string): Promise<void> {
  try {
    await transporter.sendMail({ from: FROM, to, subject, html });
    console.log(`[Email] ✓ "${subject}" → ${to}`);
  } catch (err) {
    console.error(`[Email] ✗ Failed to send "${subject}" to ${to}:`, err);
  }
}

// ─── OTP (verification / 2-FA) ───────────────────────────────────────────────

export async function sendOtpEmail(
  to: string,
  name: string,
  otp: string,
  expiresInMinutes = 10,
): Promise<void> {
  const html = layout('Your Kunga Basics verification code', `
    <p>Hi ${name || 'there'},</p>
    <p>Use the code below to verify your identity.
       It expires in <strong>${expiresInMinutes} minutes</strong>.</p>

    <div style="text-align:center;margin:32px 0;">
      <div style="display:inline-block;background:#f0fdf4;border:2px dashed #0d9488;
                  border-radius:12px;padding:20px 40px;">
        <span style="font-size:40px;font-weight:800;letter-spacing:10px;
                     color:#0d3b36;font-family:monospace;">
          ${otp}
        </span>
      </div>
    </div>

    <p style="font-size:13px;color:#6b7280;text-align:center;">
      Never share this code with anyone — Kunga Basics staff will never ask for it.
    </p>
    <p style="font-size:13px;color:#6b7280;">
      If you didn't request this code, you can safely ignore this email.
    </p>
  `);
  await send(to, 'Your Kunga Basics verification code', html);
}

// ─── 2FA enabled / disabled notifications ─────────────────────────────────────

export async function sendMfaEnabledEmail(to: string, name: string): Promise<void> {
  const html = layout('Two-factor authentication enabled', `
    <p>Hi ${name || 'there'},</p>
    <p>Two-factor authentication (2FA) has just been <strong>enabled</strong> on your Kunga Basics account.
       From now on, you'll need to enter a verification code sent to this email whenever you sign in.</p>
    <p style="font-size:13px;color:#6b7280;">
      If you didn't make this change, please contact us immediately and reset your password.
    </p>
    <p>Warm regards,<br/><strong>The Kunga Basics Team</strong></p>
  `);
  await send(to, 'Two-factor authentication enabled', html);
}

export async function sendMfaDisabledEmail(to: string, name: string): Promise<void> {
  const html = layout('Two-factor authentication disabled', `
    <p>Hi ${name || 'there'},</p>
    <p>Two-factor authentication (2FA) has just been <strong>disabled</strong> on your Kunga Basics account.
       Your account will no longer require a verification code at sign-in.</p>
    <p style="font-size:13px;color:#6b7280;">
      If you didn't make this change, please contact us immediately and reset your password.
    </p>
    <p>Warm regards,<br/><strong>The Kunga Basics Team</strong></p>
  `);
  await send(to, 'Two-factor authentication disabled', html);
}

// ─── Password reset ───────────────────────────────────────────────────────────

export async function sendPasswordResetEmail(
  to: string,
  name: string,
  resetToken: string,
): Promise<void> {
  const webUrl = `${config.app.portalUrl}/reset-password?token=${resetToken}`;

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
      If the button doesn't work, copy and paste this link:<br/>
      <a href="${webUrl}" style="color:#0d9488;word-break:break-all;">${webUrl}</a>
    </p>
    <p style="font-size:13px;color:#6b7280;">
      If you didn't request this, you can safely ignore this email —
      your password will not change.
    </p>
  `);
  await send(to, 'Reset your Kunga Basics password', html);
}

// ─── Welcome email ────────────────────────────────────────────────────────────

export async function sendWelcomeEmail(to: string, name: string): Promise<void> {
  const html = layout('Welcome to Kunga Basics!', `
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
  await send(to, 'Welcome to Kunga Basics!', html);
}

// ─── Admin → user direct message ─────────────────────────────────────────────

export async function sendAdminEmail(
  to: string,
  userName: string,
  subject: string,
  message: string,
): Promise<void> {
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
  await send(to, subject, html);
}

// ─── Subscription activated notification ─────────────────────────────────────

export async function sendSubscriptionActivatedEmail(
  to: string,
  name: string,
  plan: string,
): Promise<void> {
  const planLabel = plan === 'annual' ? 'Annual Plan' : 'Monthly Plan';
  const html = layout('Your Kunga Basics subscription is active! 🎉', `
    <p>Hi ${name || 'there'},</p>
    <p>Great news — your <strong>${planLabel}</strong> subscription is now active! 🎉</p>
    <p>You now have full access to:</p>
    <ul style="padding-left:20px;line-height:2;">
      <li>🎬 All video modules</li>
      <li>📅 Daily routine & streak tracking</li>
      <li>📊 Milestone reports & journal</li>
      <li>🎤 Ask Dr. Gad (2 questions/month)</li>
    </ul>
    <p style="text-align:center;margin:28px 0;">
      <a href="https://app.kungabasics.com"
         style="background:#0d9488;color:#ffffff;padding:14px 32px;border-radius:8px;
                text-decoration:none;font-weight:600;font-size:15px;display:inline-block;">
        Start learning
      </a>
    </p>
    <p>Warm regards,<br/><strong>The Kunga Basics Team</strong></p>
  `);
  await send(to, 'Your Kunga Basics subscription is active! 🎉', html);
}

// ─── Subscription cancelled / restored ────────────────────────────────────────

export async function sendSubscriptionCancelledEmail(
  to: string,
  name: string,
): Promise<void> {
  const html = layout('Your Kunga Basics subscription was cancelled', `
    <p>Hi ${name || 'there'},</p>
    <p>Your Kunga Basics subscription has been <strong>cancelled</strong>.
       You'll keep access until the end of your current billing period,
       after which premium features will no longer be available.</p>
    <p>Changed your mind? You can resubscribe any time from the app.</p>
    <p style="text-align:center;margin:28px 0;">
      <a href="https://app.kungabasics.com"
         style="background:#0d9488;color:#ffffff;padding:14px 32px;border-radius:8px;
                text-decoration:none;font-weight:600;font-size:15px;display:inline-block;">
        Open the app
      </a>
    </p>
    <p>Warm regards,<br/><strong>The Kunga Basics Team</strong></p>
  `);
  await send(to, 'Your Kunga Basics subscription was cancelled', html);
}

export async function sendSubscriptionRestoredEmail(
  to: string,
  name: string,
): Promise<void> {
  const html = layout('Your Kunga Basics subscription is back! 🎉', `
    <p>Hi ${name || 'there'},</p>
    <p>Good news — your Kunga Basics subscription has been <strong>restored</strong>
       and you have full access again. 🎉</p>
    <p style="text-align:center;margin:28px 0;">
      <a href="https://app.kungabasics.com"
         style="background:#0d9488;color:#ffffff;padding:14px 32px;border-radius:8px;
                text-decoration:none;font-weight:600;font-size:15px;display:inline-block;">
        Open the app
      </a>
    </p>
    <p>Warm regards,<br/><strong>The Kunga Basics Team</strong></p>
  `);
  await send(to, 'Your Kunga Basics subscription is back! 🎉', html);
}

// ─── Ask Dr. Gad — response ready ─────────────────────────────────────────────

export async function sendAskGadResponseEmail(
  to: string,
  name: string,
): Promise<void> {
  const html = layout('Dr. Gad has responded to your question 🎤', `
    <p>Hi ${name || 'there'},</p>
    <p>Dr. Gad has just responded to the question you submitted. 🎤</p>
    <p>Open the app and head to <strong>Ask Dr. Gad</strong> to watch the response.</p>
    <p style="text-align:center;margin:28px 0;">
      <a href="https://app.kungabasics.com"
         style="background:#0d9488;color:#ffffff;padding:14px 32px;border-radius:8px;
                text-decoration:none;font-weight:600;font-size:15px;display:inline-block;">
        View response
      </a>
    </p>
    <p>Warm regards,<br/><strong>The Kunga Basics Team</strong></p>
  `);
  await send(to, 'Dr. Gad has responded to your question 🎤', html);
}

// ─── Donation receipt ──────────────────────────────────────────────────────────

export async function sendDonationReceiptEmail(
  to: string,
  donorName: string,
  amountUsd: number,
  currency: string,
  campaign: string,
): Promise<void> {
  const html = layout('Thank you for your donation 💚', `
    <p>Hi ${donorName || 'there'},</p>
    <p>Thank you so much for your generous donation of
       <strong>${currency} ${amountUsd.toFixed(2)}</strong> to
       <strong>${campaign}</strong>. 💚</p>
    <p>Your support helps us bring expert guidance and developmental tools
       to families who need them most.</p>
    <p style="font-size:13px;color:#6b7280;">
      Please keep this email for your records as confirmation of your donation.
    </p>
    <p>With gratitude,<br/><strong>The Kunga Basics Team</strong></p>
  `);
  await send(to, 'Thank you for your donation 💚', html);
}

// ─── Scholarship granted ───────────────────────────────────────────────────────

export async function sendScholarshipGrantedEmail(
  to: string,
  name: string,
): Promise<void> {
  const html = layout('You’ve been granted a Kunga Basics scholarship! 🎓', `
    <p>Hi ${name || 'there'},</p>
    <p>We're delighted to let you know that you've been granted a
       <strong>full scholarship</strong> to Kunga Basics! 🎓</p>
    <p>You now have complete access to:</p>
    <ul style="padding-left:20px;line-height:2;">
      <li>🎬 All video modules</li>
      <li>📅 Daily routine & streak tracking</li>
      <li>📊 Milestone reports & journal</li>
      <li>🎤 Ask Dr. Gad</li>
    </ul>
    <p style="text-align:center;margin:28px 0;">
      <a href="https://app.kungabasics.com"
         style="background:#0d9488;color:#ffffff;padding:14px 32px;border-radius:8px;
                text-decoration:none;font-weight:600;font-size:15px;display:inline-block;">
        Start learning
      </a>
    </p>
    <p>Warm regards,<br/><strong>The Kunga Basics Team</strong></p>
  `);
  await send(to, 'You’ve been granted a Kunga Basics scholarship! 🎓', html);
}

// ─── Announcement broadcast ────────────────────────────────────────────────────

export async function sendAnnouncementEmail(
  to: string,
  name: string,
  title: string,
  body: string,
): Promise<void> {
  const html = layout(title, `
    <p>Hi ${name || 'there'},</p>
    <p>${body.replace(/\n/g, '<br/>')}</p>
    <p style="text-align:center;margin:28px 0;">
      <a href="https://app.kungabasics.com"
         style="background:#0d9488;color:#ffffff;padding:14px 32px;border-radius:8px;
                text-decoration:none;font-weight:600;font-size:15px;display:inline-block;">
        Open the app
      </a>
    </p>
    <p>Warm regards,<br/><strong>The Kunga Basics Team</strong></p>
  `);
  await send(to, title, html);
}
