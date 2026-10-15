import dotenv from "dotenv";
dotenv.config();

const portValue = Number(process.env.PORT ?? 4000);
const polarMode = (process.env.POLAR_SERVER ?? "sandbox").trim();
const polarProductIds = (process.env.POLAR_PRODUCT_IDS ?? "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

function originOf(value: string | null) {
  if (!value) {
    return null;
  }
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

const polarSuccessUrl = (process.env.POLAR_SUCCESS_URL ?? "").trim() || null;
const polarReturnUrl = (process.env.POLAR_RETURN_URL ?? "").trim() || null;

// Origins a client may use for checkout success/return URLs. Defaults to the origins of
// POLAR_SUCCESS_URL / POLAR_RETURN_URL; CHECKOUT_ALLOWED_ORIGINS adds more (comma-separated).
const checkoutAllowedOrigins = [
  ...new Set(
    [
      originOf(polarSuccessUrl),
      originOf(polarReturnUrl),
      ...(process.env.CHECKOUT_ALLOWED_ORIGINS ?? "").split(",").map((value) => originOf(value.trim())),
    ].filter((value): value is string => Boolean(value)),
  ),
];

/**
 * Express `trust proxy`: which hops may set X-Forwarded-For. Defaults to "loopback" (a
 * reverse proxy on the same host). `true` would let any client spoof its IP, which breaks
 * rate limiting and log attribution.
 */
function parseTrustProxy(value: string | undefined): boolean | number | string {
  const raw = (value ?? "").trim();
  if (!raw) {
    return "loopback";
  }
  if (raw === "true" || raw === "false") {
    return raw === "true";
  }
  if (/^\d+$/.test(raw)) {
    return Number(raw);
  }
  return raw;
}

export const env = {
  port: Number.isFinite(portValue) ? portValue : 4000,
  adminApiKey: (process.env.LICENSE_API_KEY ?? "").trim(),
  databaseUrl: (process.env.DATABASE_URL ?? "").trim(),
  polarAccessToken: (process.env.POLAR_ACCESS_TOKEN ?? "").trim(),
  polarOrganizationId: (process.env.POLAR_ORGANIZATION_ID ?? "").trim(),
  polarWebhookSecret: (process.env.POLAR_WEBHOOK_SECRET ?? "").trim(),
  polarServer: (polarMode === "production" ? "production" : "sandbox") as "production" | "sandbox",
  polarSuccessUrl,
  polarReturnUrl,
  polarProductIds,
  // Browser origins (landing page) allowed for CORS and checkout redirects.
  checkoutAllowedOrigins,
  trustProxy: parseTrustProxy(process.env.TRUST_PROXY),
  sentryDsn: (process.env.SENTRY_DSN ?? "").trim() || null,
  sentryEnvironment: (process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV ?? "development").trim(),
  smtpHost: (process.env.SMTP_HOST ?? "").trim() || null,
  smtpPort: Number(process.env.SMTP_PORT ?? 587),
  smtpSecure: (process.env.SMTP_SECURE ?? "false").trim() === "true",
  smtpUser: (process.env.SMTP_USER ?? "").trim() || null,
  smtpPass: (process.env.SMTP_PASS ?? "").trim() || null,
  smtpFrom: (process.env.SMTP_FROM ?? "").trim() || null,
};

// The admin API can list and revoke licenses; never run it with a missing or placeholder key.
if (!env.adminApiKey || env.adminApiKey === "change-me") {
  throw new Error("LICENSE_API_KEY must be set to a non-default value");
}
