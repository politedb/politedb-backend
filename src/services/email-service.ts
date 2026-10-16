import nodemailer, { type Transporter } from "nodemailer";
import { env } from "../config/env";

type LicenseEmailInput = {
  to: string;
  customerName?: string | null;
  product: string;
  planName: string;
  licenseKey: string;
  instanceName?: string | null;
  seatsAllowed: number;
  expiresAt?: string | null;
};

let transporter: Transporter | null = null;

function isEmailConfigured() {
  return Boolean(env.smtpHost && env.smtpFrom);
}

function getTransporter() {
  if (!isEmailConfigured()) {
    throw new Error("EMAIL_NOT_CONFIGURED");
  }

  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.smtpHost!,
      port: Number.isFinite(env.smtpPort) ? env.smtpPort : 587,
      secure: env.smtpSecure,
      auth:
        env.smtpUser && env.smtpPass
          ? {
              user: env.smtpUser,
              pass: env.smtpPass,
            }
          : undefined,
    });
  }

  return transporter;
}

function formatExpiry(expiresAt?: string | null) {
  if (!expiresAt) {
    return "No expiration date";
  }

  const date = new Date(expiresAt);
  if (Number.isNaN(date.getTime())) {
    return expiresAt;
  }

  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  const hours = String(date.getUTCHours()).padStart(2, "0");
  const minutes = String(date.getUTCMinutes()).padStart(2, "0");
  const seconds = String(date.getUTCSeconds()).padStart(2, "0");

  return `${year}-${month}-${day}, ${hours}:${minutes}:${seconds} GMT+0`;
}

export function canSendLicenseEmails() {
  return isEmailConfigured();
}

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

function escapeHtml(value: string | number) {
  return String(value).replace(/[&<>"']/g, (char) => HTML_ESCAPES[char]);
}

/**
 * The buyer chooses their own name at checkout and can enter someone else's email, so the
 * name must not turn our license email into a phishing message. Use it only when it looks
 * like a plain name: no links, no email addresses, no control characters, bounded length.
 */
export function safeDisplayName(name?: string | null) {
  const cleaned = (name ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  if (!cleaned || cleaned.length > 60) {
    return null;
  }
  if (/[<>@]|:\/\/|www\.|\.(com|net|org|io|app|link|xyz|ru|cn)\b/i.test(cleaned)) {
    return null;
  }
  return cleaned;
}

/** Builds the license email. Pure, so the escaping is testable. */
export function renderLicenseIssuedEmail(input: Omit<LicenseEmailInput, "to">) {
  const greetingName = safeDisplayName(input.customerName) ?? safeDisplayName(input.instanceName) ?? "there";
  const expiryLabel = formatExpiry(input.expiresAt);
  const subject = `Welcome to ${input.product} - ${input.planName} plan`;
  const text = [
    `Hi ${greetingName},`,
    "",
    "Your purchase was successful. Here's your license information:",
    "",
    `🔐 License key: ${input.licenseKey}`,
    `📦 Plan: ${input.planName}`,
    `👥 Seats: ${input.seatsAllowed}`,
    `🗓️ Expires at: ${expiryLabel}`,
    "",
    "Keep this key somewhere safe. You can use it to activate your product.",
    "",
    "---",
    "",
    "Get started",
    "",
    "- Open the app",
    "- Navigate to Settings → License key",
    "- Enter your key and activate",
    "",
    "---",
    "",
    "What you just unlocked",
    "",
    "✓ Unlimited connections",
    "✓ Advanced query tools",
    "✓ Priority updates",
    "✓ Unlock all features",
    "",
    "---",
    "",
    "Need help? Our team is here for you anytime.",
    "",
    "Best,",
    `The ${input.product} Team`,
  ].join("\n");

  const html = [
    `<p>Hi ${escapeHtml(greetingName)},</p>`,
    "<p>Your purchase was successful. Here's your license key:</p>",
    "<div>",
    `<p><strong>🔐 License key:</strong> <code>${escapeHtml(input.licenseKey)}</code></p>`,
    `<p><strong>📦 Plan:</strong> ${escapeHtml(input.planName)}</p>`,
    `<p><strong>👥 Seats:</strong> ${escapeHtml(input.seatsAllowed)}</p>`,
    `<p><strong>🗓️ Expires at:</strong> ${escapeHtml(expiryLabel)}</p>`,
    "</div>",
    "<p>Keep this key somewhere safe. You can use it to activate your product.</p>",
    "<hr>",
    "<h3>Get started</h3>",
    "<div>",
    "<p>- Open the app</p>",
    "<p>- Navigate to Settings &rarr; License key</p>",
    "<p>- Enter your key and activate</p>",
    "</div>",
    "<hr>",
    "<h3>What you just unlocked</h3>",
    "<div>",
    "<p>&#10003; Unlimited connections</p>",
    "<p>&#10003; Advanced query tools</p>",
    "<p>&#10003; Priority updates</p>",
    "<p>&#10003; Unlock all features</p>",
    "</div>",
    "<hr>",
    "<p>Need help? Our team is here for you anytime.</p>",
    `<p>Best,<br>The ${escapeHtml(input.product)} Team</p>`,
  ].join("");

  return { subject, text, html };
}

export async function sendLicenseIssuedEmail(input: LicenseEmailInput) {
  const client = getTransporter();
  const { subject, text, html } = renderLicenseIssuedEmail(input);

  await client.sendMail({
    from: env.smtpFrom!,
    to: input.to,
    subject,
    text,
    html,
  });
}
