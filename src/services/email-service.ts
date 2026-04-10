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
  const subject = `Your ${input.product} license key`;
  const text = [
    `Hi ${greetingName},`,
    "",
    "Your purchase was successful. Here is your license information:",
    `Product: ${input.product}`,
    `Plan: ${input.planName}`,
    `License key: ${input.licenseKey}`,
    `Seats: ${input.seatsAllowed}`,
    `Expires at: ${expiryLabel}`,
    "",
    "Keep this key somewhere safe. You can use it to activate your product.",
  ].join("\n");

  const html = [
    `<p>Hi ${greetingName},</p>`,
    "<p>Your purchase was successful. Here is your license information:</p>",
    "<ul>",
    `<li><strong>Product:</strong> ${input.product}</li>`,
    `<li><strong>Plan:</strong> ${input.planName}</li>`,
    `<li><strong>License key:</strong> <code>${input.licenseKey}</code></li>`,
    `<li><strong>Seats:</strong> ${input.seatsAllowed}</li>`,
    `<li><strong>Expires at:</strong> ${expiryLabel}</li>`,
    "</ul>",
    "<p>Keep this key somewhere safe. You can use it to activate your product.</p>",
  ].join("");

  await client.sendMail({
    from: env.smtpFrom!,
    to: input.to,
    subject,
    text,
    html,
  });
}
