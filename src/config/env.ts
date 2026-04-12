import path from "node:path";
import dotenv from "dotenv";
dotenv.config();

const portValue = Number(process.env.PORT ?? 4000);
const polarMode = (process.env.POLAR_SERVER ?? "sandbox").trim();
const polarProductIds = (process.env.POLAR_PRODUCT_IDS ?? "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

export const env = {
  port: Number.isFinite(portValue) ? portValue : 4000,
  adminApiKey: (process.env.LICENSE_API_KEY ?? "change-me").trim(),
  defaultProduct: (process.env.DEFAULT_PRODUCT ?? "politedb").trim(),
  databasePath: path.resolve(process.cwd(), process.env.DATABASE_PATH ?? "./data/license-key.db"),
  databaseUrl: (process.env.DATABASE_URL ?? "").trim(),
  polarAccessToken: (process.env.POLAR_ACCESS_TOKEN ?? "").trim(),
  polarOrganizationId: (process.env.POLAR_ORGANIZATION_ID ?? "").trim(),
  polarWebhookSecret: (process.env.POLAR_WEBHOOK_SECRET ?? "").trim(),
  polarServer: (polarMode === "production" ? "production" : "sandbox") as "production" | "sandbox",
  polarSuccessUrl: (process.env.POLAR_SUCCESS_URL ?? "").trim() || null,
  polarReturnUrl: (process.env.POLAR_RETURN_URL ?? "").trim() || null,
  polarProductIds,
  smtpHost: (process.env.SMTP_HOST ?? "").trim() || null,
  smtpPort: Number(process.env.SMTP_PORT ?? 587),
  smtpSecure: (process.env.SMTP_SECURE ?? "false").trim() === "true",
  smtpUser: (process.env.SMTP_USER ?? "").trim() || null,
  smtpPass: (process.env.SMTP_PASS ?? "").trim() || null,
  smtpFrom: (process.env.SMTP_FROM ?? "").trim() || null,
};

if (!env.adminApiKey) {
  throw new Error("LICENSE_API_KEY is required");
}
