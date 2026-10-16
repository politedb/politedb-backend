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

export async function sendLicenseIssuedEmail(input: LicenseEmailInput) {
  const client = getTransporter();
  const greetingName = input.customerName?.trim() || input.instanceName?.trim() || "there";
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
    `<p>Hi ${greetingName},</p>`,
    "<p>Your purchase was successful. Here's your license key:</p>",
    "<div>",
    `<p><strong>🔐 License key:</strong> <code>${input.licenseKey}</code></p>`,
    `<p><strong>📦 Plan:</strong> ${input.planName}</p>`,
    `<p><strong>👥 Seats:</strong> ${input.seatsAllowed}</p>`,
    `<p><strong>🗓️ Expires at:</strong> ${expiryLabel}</p>`,
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
    `<p>Best,<br>The ${input.product} Team</p>`,
  ].join("");

  await client.sendMail({
    from: env.smtpFrom!,
    to: input.to,
    subject,
    text,
    html,
  });
}
