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
  isAdmin: boolean = false,
): Promise<void> {
  const baseUrl = isAdmin ? config.app.portalUrl : config.app.userPortalUrl;
  const webUrl  = `${baseUrl}/reset-password?token=${resetToken}`;

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

// ─── Shared subscription helpers ─────────────────────────────────────────────

function planMeta(plan: string): { tierLabel: string; periodLabel: string; isGold: boolean; features: string[] } {
  const isGold  = plan.startsWith('gold');
  const tierLabel   = isGold ? 'Gold' : 'Premium';
  const periodPart  = plan.split('_').slice(1).join('_');
  const periodLabel = periodPart === 'quarterly' ? '3-Month' : periodPart === 'annual' ? 'Annual' : 'Monthly';

  const features = isGold
    ? ['All video learning modules', 'Daily routine & streak tracking', 'Milestone reports & progress journal', 'Priority customer support']
    : ['All video learning modules', 'Daily routine & streak tracking', 'Milestone reports & progress journal', 'Unlimited Ask Dr. Gad questions', 'Upload videos & photos to show Dr. Gad', 'Offline mode & cross-device sync', 'Priority customer support'];

  return { tierLabel, periodLabel, isGold, features };
}

const CTA_STYLE = `background:#16a34a;color:#ffffff;padding:14px 36px;border-radius:8px;
                   text-decoration:none;font-weight:700;font-size:15px;display:inline-block;
                   letter-spacing:0.2px;`;

const BADGE_GOLD    = `background:#fef3c7;color:#92400e;padding:3px 10px;border-radius:20px;
                        font-size:12px;font-weight:700;letter-spacing:0.5px;display:inline-block;`;
const BADGE_PREMIUM = `background:#dcfce7;color:#14532d;padding:3px 10px;border-radius:20px;
                        font-size:12px;font-weight:700;letter-spacing:0.5px;display:inline-block;`;

// ─── Subscription activated ───────────────────────────────────────────────────

export async function sendSubscriptionActivatedEmail(
  to: string,
  name: string,
  plan: string,
  periodEnd?: Date,
): Promise<void> {
  const { tierLabel, periodLabel, isGold, features } = planMeta(plan);
  const badge = isGold ? BADGE_GOLD : BADGE_PREMIUM;
  const renewalLine = periodEnd
    ? `<p style="margin:0 0 20px;color:#6b7280;font-size:13px;">
         Your subscription renews on <strong style="color:#374151;">
         ${periodEnd.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</strong>.
       </p>`
    : '';

  const featureRows = features
    .map(f => `<tr>
      <td style="padding:9px 0;border-bottom:1px solid #f3f4f6;vertical-align:middle;">
        <span style="display:inline-block;width:22px;height:22px;background:#dcfce7;border-radius:50%;
                     text-align:center;line-height:22px;font-size:12px;margin-right:10px;">✓</span>
        <span style="color:#374151;font-size:14px;">${f}</span>
      </td>
    </tr>`)
    .join('');

  const html = layout(`Your Kunga Basics ${tierLabel} subscription is active`, `
    <p style="margin:0 0 4px;">Hi ${name || 'there'},</p>
    <p style="margin:0 0 24px;color:#6b7280;">Welcome to Kunga Basics ${tierLabel}.</p>

    <div style="background:#f0faf4;border:1px solid #bbf7d0;border-radius:10px;padding:20px 24px;margin-bottom:24px;">
      <div style="margin-bottom:12px;">
        <span style="${badge}">${tierLabel.toUpperCase()} PLAN</span>
        <span style="font-size:13px;color:#6b7280;margin-left:8px;">${periodLabel}</span>
      </div>
      <p style="margin:0 0 4px;font-size:22px;font-weight:700;color:#14532d;">
        Subscription Active ✓
      </p>
      ${renewalLine}
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:4px;">
        ${featureRows}
      </table>
    </div>

    <p style="color:#374151;margin-bottom:24px;">
      Start exploring everything available to you — track your child's milestones,
      follow daily learning routines, and watch expert-led video modules designed
      for their unique developmental journey.
    </p>

    <p style="text-align:center;margin:28px 0;">
      <a href="https://app.kungabasics.com" style="${CTA_STYLE}">Open Kunga Basics</a>
    </p>

    <p style="color:#9ca3af;font-size:13px;margin-top:28px;">
      Questions about your subscription? Reply to this email or contact us at
      <a href="mailto:support@kungabasics.com" style="color:#16a34a;">support@kungabasics.com</a>
    </p>
    <p style="margin-top:20px;">Warm regards,<br/><strong>The Kunga Basics Team</strong></p>
  `);
  await send(to, `Your Kunga Basics ${tierLabel} plan is now active`, html);
}

// ─── Renewal reminder (3 days before expiry) ─────────────────────────────────

export async function sendSubscriptionRenewalReminderEmail(
  to: string,
  name: string,
  plan: string,
  periodEnd: Date,
  amount: number,
  currency: string,
): Promise<void> {
  const { tierLabel, periodLabel, isGold } = planMeta(plan);
  const badge = isGold ? BADGE_GOLD : BADGE_PREMIUM;
  const renewalDate = periodEnd.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const amountDisplay = `${currency} ${amount.toFixed(2)}`;

  const html = layout(`Your Kunga Basics ${tierLabel} plan renews in 3 days`, `
    <p style="margin:0 0 4px;">Hi ${name || 'there'},</p>
    <p style="margin:0 0 24px;color:#6b7280;">Just a friendly heads-up about your upcoming renewal.</p>

    <div style="background:#fffbeb;border:1px solid #fcd34d;border-radius:10px;padding:20px 24px;margin-bottom:24px;">
      <div style="margin-bottom:10px;">
        <span style="${badge}">${tierLabel.toUpperCase()} PLAN</span>
        <span style="font-size:13px;color:#6b7280;margin-left:8px;">${periodLabel}</span>
      </div>
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="padding:6px 0;font-size:14px;color:#374151;">Renewal date</td>
          <td style="padding:6px 0;font-size:14px;color:#374151;text-align:right;font-weight:600;">${renewalDate}</td>
        </tr>
        <tr>
          <td style="padding:6px 0;font-size:14px;color:#374151;border-top:1px solid #fef3c7;">Amount</td>
          <td style="padding:6px 0;font-size:14px;color:#374151;text-align:right;font-weight:600;border-top:1px solid #fef3c7;">${amountDisplay}</td>
        </tr>
      </table>
    </div>

    <p style="color:#374151;margin-bottom:20px;">
      Your card on file will be charged automatically on <strong>${renewalDate}</strong>.
      If you'd like to cancel before then, you can do so from <strong>Settings → Subscription</strong> in the app.
    </p>

    <p style="text-align:center;margin:28px 0;">
      <a href="https://app.kungabasics.com" style="${CTA_STYLE}">Open the app</a>
    </p>

    <p style="color:#9ca3af;font-size:13px;margin-top:28px;">
      Need help? Contact us at
      <a href="mailto:support@kungabasics.com" style="color:#16a34a;">support@kungabasics.com</a>
    </p>
    <p style="margin-top:20px;">Warm regards,<br/><strong>The Kunga Basics Team</strong></p>
  `);
  await send(to, `Your Kunga Basics ${tierLabel} plan renews on ${renewalDate}`, html);
}

// ─── Auto-renewal payment failed ─────────────────────────────────────────────

export async function sendSubscriptionRenewalFailedEmail(
  to: string,
  name: string,
  plan: string,
  amount: number,
  currency: string,
): Promise<void> {
  const { tierLabel, periodLabel, isGold } = planMeta(plan);
  const badge = isGold ? BADGE_GOLD : BADGE_PREMIUM;
  const amountDisplay = `${currency} ${amount.toFixed(2)}`;

  const html = layout(`Action required: Kunga Basics payment failed`, `
    <p style="margin:0 0 4px;">Hi ${name || 'there'},</p>
    <p style="margin:0 0 24px;color:#6b7280;">We were unable to process your renewal payment.</p>

    <div style="background:#fff1f2;border:1px solid #fecdd3;border-radius:10px;padding:20px 24px;margin-bottom:24px;">
      <p style="margin:0 0 8px;font-size:16px;font-weight:700;color:#9f1239;">Payment Unsuccessful</p>
      <div style="margin-bottom:10px;">
        <span style="${badge}">${tierLabel.toUpperCase()} PLAN</span>
        <span style="font-size:13px;color:#6b7280;margin-left:8px;">${periodLabel}</span>
      </div>
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="padding:6px 0;font-size:14px;color:#374151;">Amount attempted</td>
          <td style="padding:6px 0;font-size:14px;color:#374151;text-align:right;font-weight:600;">${amountDisplay}</td>
        </tr>
      </table>
    </div>

    <p style="color:#374151;margin-bottom:12px;">
      Your subscription has been paused. To continue enjoying Kunga Basics without interruption,
      please renew your subscription from the app — it only takes a moment.
    </p>

    <p style="color:#374151;margin-bottom:24px;">Common reasons for payment failure:</p>
    <ul style="color:#374151;font-size:14px;line-height:1.9;padding-left:20px;margin-bottom:24px;">
      <li>Insufficient card balance</li>
      <li>Card expired or details changed</li>
      <li>Bank declined the transaction</li>
    </ul>

    <p style="text-align:center;margin:28px 0;">
      <a href="https://app.kungabasics.com" style="background:#dc2626;color:#ffffff;padding:14px 36px;border-radius:8px;
         text-decoration:none;font-weight:700;font-size:15px;display:inline-block;">
        Renew my subscription
      </a>
    </p>

    <p style="color:#9ca3af;font-size:13px;margin-top:28px;">
      If you need help, contact us at
      <a href="mailto:support@kungabasics.com" style="color:#16a34a;">support@kungabasics.com</a>
      and we'll sort it out together.
    </p>
    <p style="margin-top:20px;">Warm regards,<br/><strong>The Kunga Basics Team</strong></p>
  `);
  await send(to, 'Action required: Your Kunga Basics payment was declined', html);
}

// ─── Subscription cancelled / restored ────────────────────────────────────────

export async function sendSubscriptionCancelledEmail(
  to: string,
  name: string,
  periodEnd?: Date,
): Promise<void> {
  const expiryLine = periodEnd
    ? `You'll keep full access until <strong>${periodEnd.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</strong>, after which premium features will no longer be available.`
    : `You'll keep access until the end of your current billing period, after which premium features will no longer be available.`;

  const html = layout('Your Kunga Basics subscription has been cancelled', `
    <p style="margin:0 0 4px;">Hi ${name || 'there'},</p>
    <p style="margin:0 0 24px;color:#6b7280;">We've processed your cancellation request.</p>

    <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;padding:20px 24px;margin-bottom:24px;">
      <p style="margin:0 0 8px;font-size:15px;font-weight:600;color:#374151;">Subscription cancelled</p>
      <p style="margin:0;font-size:14px;color:#6b7280;">${expiryLine}</p>
    </div>

    <p style="color:#374151;margin-bottom:20px;">
      We're sorry to see you go. If there's anything we could have done better,
      we'd love to hear from you — reply to this email and share your thoughts.
    </p>

    <p style="color:#374151;margin-bottom:24px;">
      Changed your mind? You can resubscribe any time from <strong>Settings → Subscription</strong> in the app.
    </p>

    <p style="text-align:center;margin:28px 0;">
      <a href="https://app.kungabasics.com" style="${CTA_STYLE}">Open the app</a>
    </p>

    <p style="color:#9ca3af;font-size:13px;margin-top:28px;">
      Questions? Contact us at
      <a href="mailto:support@kungabasics.com" style="color:#16a34a;">support@kungabasics.com</a>
    </p>
    <p style="margin-top:20px;">Warm regards,<br/><strong>The Kunga Basics Team</strong></p>
  `);
  await send(to, 'Your Kunga Basics subscription has been cancelled', html);
}

export async function sendSubscriptionRestoredEmail(
  to: string,
  name: string,
  plan?: string,
  periodEnd?: Date,
): Promise<void> {
  const tierLabel = plan ? planMeta(plan).tierLabel : 'Premium';
  const renewalLine = periodEnd
    ? `<p style="margin:0;font-size:13px;color:#6b7280;">
         Next renewal: <strong style="color:#374151;">
         ${periodEnd.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</strong>
       </p>`
    : '';

  const html = layout(`Your Kunga Basics ${tierLabel} subscription is back`, `
    <p style="margin:0 0 4px;">Hi ${name || 'there'},</p>
    <p style="margin:0 0 24px;color:#6b7280;">Great news — your subscription has been restored.</p>

    <div style="background:#f0faf4;border:1px solid #bbf7d0;border-radius:10px;padding:20px 24px;margin-bottom:24px;">
      <p style="margin:0 0 6px;font-size:22px;font-weight:700;color:#14532d;">Access Restored ✓</p>
      ${renewalLine}
    </div>

    <p style="color:#374151;margin-bottom:24px;">
      All your ${tierLabel} features are active again — your progress, milestones, and history are exactly where you left them.
    </p>

    <p style="text-align:center;margin:28px 0;">
      <a href="https://app.kungabasics.com" style="${CTA_STYLE}">Continue learning</a>
    </p>

    <p style="color:#9ca3af;font-size:13px;margin-top:28px;">
      Questions? Contact us at
      <a href="mailto:support@kungabasics.com" style="color:#16a34a;">support@kungabasics.com</a>
    </p>
    <p style="margin-top:20px;">Warm regards,<br/><strong>The Kunga Basics Team</strong></p>
  `);
  await send(to, `Your Kunga Basics ${tierLabel} subscription is back`, html);
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

// ─── Child Assessment report ───────────────────────────────────────────────────

const DOMAIN_LABELS: Record<string, string> = {
  communication: 'Communication',
  attention: 'Attention',
  socialInteraction: 'Social Interaction',
  sensoryProcessing: 'Sensory Processing',
  movement: 'Movement',
};

function domainScoreColor(pct: number): string {
  if (pct >= 70) return '#0d9488';
  if (pct >= 45) return '#d97706';
  return '#dc2626';
}

export async function sendAssessmentReportEmail(
  to: string,
  parentName: string,
  childName: string,
  domainScores: Record<string, number>,
  recommendedProgram: string | null,
  strengths: string[],
  areasToSupport: string[],
): Promise<void> {
  const domainRows = Object.entries(domainScores ?? {})
    .map(([key, pct]) => {
      const label = DOMAIN_LABELS[key] ?? key.replace(/([A-Z])/g, ' $1');
      const color = domainScoreColor(pct);
      return `
        <tr>
          <td style="padding:8px 0;font-size:14px;color:#374151;">${label}</td>
          <td style="padding:8px 0;text-align:right;">
            <span style="background:${color}1a;color:${color};font-weight:700;font-size:13px;
                         padding:3px 10px;border-radius:100px;">${pct}%</span>
          </td>
        </tr>`;
    })
    .join('');

  const strengthsHtml = strengths.length
    ? `<ul style="padding-left:20px;line-height:1.9;font-size:14px;color:#374151;">
         ${strengths.map(s => `<li>${s}</li>`).join('')}
       </ul>`
    : `<p style="font-size:14px;color:#9ca3af;">No specific strengths flagged.</p>`;

  const areasHtml = areasToSupport.length
    ? `<ul style="padding-left:20px;line-height:1.9;font-size:14px;color:#374151;">
         ${areasToSupport.map(a => `<li>${a}</li>`).join('')}
       </ul>`
    : `<p style="font-size:14px;color:#9ca3af;">No specific areas flagged.</p>`;

  const html = layout(`${childName}'s Development Assessment Report`, `
    <p>Hi ${parentName || 'there'},</p>
    <p>Thank you for completing <strong>${childName}'s</strong> development assessment.
       Here's a summary of the results:</p>

    <table width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;border-top:1px solid #f3f4f6;">
      ${domainRows}
    </table>

    ${recommendedProgram ? `
    <p style="background:#f0fdfa;border:1px solid #99f6e4;border-radius:10px;padding:14px 16px;font-size:14px;color:#0f766e;">
      🎯 <strong>Recommended Program:</strong> ${recommendedProgram}
    </p>` : ''}

    <p style="font-weight:700;font-size:14px;color:#111827;margin-top:24px;">🌟 Strengths</p>
    ${strengthsHtml}

    <p style="font-weight:700;font-size:14px;color:#111827;">🎯 Areas to Support</p>
    ${areasHtml}

    <p style="font-size:13px;color:#6b7280;">
      This is an informal screening tool and not a clinical diagnosis. For a detailed
      review and a personalised intervention plan, book a consultation with one of
      our expert therapists.
    </p>

    <p style="text-align:center;margin:28px 0;">
      <a href="https://app.kungabasics.com"
         style="background:#0d9488;color:#ffffff;padding:14px 32px;border-radius:8px;
                text-decoration:none;font-weight:600;font-size:15px;display:inline-block;">
        View Full Report in the App
      </a>
    </p>

    <p>Warm regards,<br/><strong>The Kunga Basics Team</strong></p>
  `);

  await send(to, `${childName}'s Development Assessment Report`, html);
}
