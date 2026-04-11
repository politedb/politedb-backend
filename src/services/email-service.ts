import nodemailer from "nodemailer";
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

let transporter: nodemailer.Transporter | null = null;

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

  return date.toISOString();
}

export function canSendLicenseEmails() {
  return isEmailConfigured();
}

export async function sendLicenseIssuedEmail(input: LicenseEmailInput) {
  const client = getTransporter();
  const greetingName = input.customerName?.trim() || input.instanceName?.trim() || "there";
  const expiryLabel = formatExpiry(input.expiresAt);
  const subject = `Welcome to ${input.product} ${input.planName}`;
  const text = [
    `Hi ${greetingName},`,
    "",
    "Your purchase was successful. Here's your license information:",
    "",
    `Plan: ${input.planName}`,
    `License key: ${input.licenseKey}`,
    `Seats: ${input.seatsAllowed}`,
    `Expires at: ${expiryLabel}`,
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
    `<p style="font-size:20px;"><strong>🔐 ${input.licenseKey}</strong></p>`,
    "<ul>",
    `<li><strong>Plan:</strong> ${input.planName}</li>`,
    `<li><strong>License key:</strong> <code>${input.licenseKey}</code></li>`,
    `<li><strong>Seats:</strong> ${input.seatsAllowed}</li>`,
    `<li><strong>Expires at:</strong> ${expiryLabel}</li>`,
    "</ul>",
    "<p>Keep this key somewhere safe. You can use it to activate your product.</p>",
    "<hr>",
    "<h3>Get started</h3>",
    "<ul>",
    "<li>Open the app</li>",
    "<li>Navigate to Settings &rarr; License key</li>",
    "<li>Enter your key and activate</li>",
    "</ul>",
    "<hr>",
    "<h3>What you just unlocked</h3>",
    "<ul>",
    "<li>&#10003; Unlimited connections</li>",
    "<li>&#10003; Advanced query tools</li>",
    "<li>&#10003; Priority updates</li>",
    "<li>&#10003; Unlock all features</li>",
    "</ul>",
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
