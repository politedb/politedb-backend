import { z } from "zod";
import { validateEvent, WebhookVerificationError } from "@polar-sh/sdk/webhooks";
import { env } from "../config/env";
import type { PolarLicenseDelivery } from "../db/entities";
import { AppError, badRequest } from "../errors";
import { getPolarClient } from "../libs/polar";
import { normalizeHeaders } from "../utils/common";
import { canSendLicenseEmails, sendLicenseIssuedEmail } from "./email-service";
import {
  claimPolarLicenseKeyEmail,
  getPolarLicenseKeyDelivery,
  listPolarLicenseKeyDeliveriesWithErrors,
  markPolarLicenseKeyEmailFailed,
  markPolarLicenseKeyEmailSent,
  upsertPolarLicenseKeyDelivery,
} from "./polar-license-delivery";
import { revokeLocalLicenseForPolarKey } from "./polar-license-key";

const LICENSE_PRODUCT_NAME = "PoliteDB";

type BenefitGrantLicenseKeysProperties = {
  licenseKeyId?: string;
};

// Unknown keys (e.g. `customerId`, `externalCustomerId`) are stripped: a public caller must
// not attach a checkout to an existing Polar customer.
const checkoutSchema = z.object({
  productIds: z.array(z.string().min(1)).min(1).optional(),
  successUrl: z.url().optional(),
  returnUrl: z.url().optional(),
  customerEmail: z.email().optional(),
  customerName: z.string().trim().min(1).optional(),
  seats: z.int().positive().optional(),
  metadata: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
  licenseProduct: z.string().trim().min(1).optional(),
  planName: z.string().trim().min(1).optional(),
  seatsAllowed: z.int().positive().optional(),
});

function getCheckoutProductIds(requested?: string[]) {
  if (!requested?.length) {
    if (!env.polarProductIds.length) {
      throw new Error("POLAR_PRODUCT_IDS is required unless productIds is provided");
    }
    return env.polarProductIds;
  }

  // Only products configured on the server can be sold through this public endpoint.
  const notAllowed = requested.filter((id) => !env.polarProductIds.includes(id));
  if (notAllowed.length) {
    throw badRequest("PRODUCT_NOT_ALLOWED", "This product is not available for checkout.");
  }

  return requested;
}

function assertAllowedRedirect(url: string | undefined) {
  if (!url) {
    return;
  }
  if (!env.checkoutAllowedOrigins.includes(new URL(url).origin)) {
    throw badRequest("REDIRECT_NOT_ALLOWED", "Checkout redirect URL is not allowed.");
  }
}

function getSuccessUrl(requested?: string) {
  const successUrl = requested ?? env.polarSuccessUrl ?? undefined;
  if (!successUrl) {
    throw new Error("POLAR_SUCCESS_URL is required unless successUrl is provided");
  }

  return successUrl;
}

function planNameFromBenefitDescription(description: string) {
  return description.replace("License Key", "").trim();
}

type LicenseEmailContext = {
  grantId: string;
  /** Admin resend: send even if the email already went out. */
  resend?: boolean;
  licenseKeyId: string;
  customerEmail: string;
  customerName?: string | null;
  planName?: string | null;
};

type LicenseEmailResult =
  | { status: "sent" }
  | { status: "skipped"; reason: string };

/**
 * Sends the license email once per grant. Throws `LICENSE_EMAIL_FAILED` (503) on failure
 * so the webhook responds non-2xx and Polar retries the delivery.
 */
async function sendLicenseEmailForGrant(context: LicenseEmailContext): Promise<LicenseEmailResult> {
  if (!(await claimPolarLicenseKeyEmail(context.grantId, { allowSent: context.resend }))) {
    return { status: "skipped", reason: "ALREADY_SENT_OR_IN_PROGRESS" };
  }

  const polar = getPolarClient();

  try {
    const licenseKey = await polar.licenseKeys.get({ id: context.licenseKeyId });
    const planName =
      context.planName?.trim() ||
      planNameFromBenefitDescription(
        (await polar.benefits.get({ id: licenseKey.benefitId })).description,
      ) ||
      "Polar License";

    await sendLicenseIssuedEmail({
      to: context.customerEmail,
      customerName: context.customerName,
      product: LICENSE_PRODUCT_NAME,
      planName,
      licenseKey: licenseKey.key,
      instanceName: null,
      seatsAllowed: licenseKey.limitActivations ?? 1,
      expiresAt: licenseKey.expiresAt?.toISOString() ?? null,
    });
    await markPolarLicenseKeyEmailSent(context.grantId);
    return { status: "sent" };
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN_EMAIL_ERROR";
    await markPolarLicenseKeyEmailFailed(context.grantId, message);
    console.error(`Failed to send Polar license key email for grant ${context.grantId}`);
    throw new AppError(503, "LICENSE_EMAIL_FAILED", "License email could not be sent.");
  }
}

async function maybeSendPolarLicenseKeyEmail(event: {
  grantId: string;
  orderId?: string | null;
  benefitId?: string | null;
  planName?: string | null;
  licenseKeyId?: string | null;
  customerEmail?: string | null;
  customerName?: string | null;
}): Promise<LicenseEmailResult> {
  if (!event.customerEmail) {
    return { status: "skipped", reason: "CUSTOMER_EMAIL_MISSING" };
  }

  await upsertPolarLicenseKeyDelivery({
    grantId: event.grantId,
    orderId: event.orderId,
    benefitId: event.benefitId,
    licenseKeyId: event.licenseKeyId,
    customerEmail: event.customerEmail,
  });

  const delivery = await getPolarLicenseKeyDelivery(event.grantId);
  if (delivery?.emailSentAt) {
    return { status: "skipped", reason: "ALREADY_SENT" };
  }

  if (!canSendLicenseEmails()) {
    return { status: "skipped", reason: "EMAIL_NOT_CONFIGURED" };
  }

  // The key may not exist yet on `benefit_grant.created`; `benefit_grant.updated` follows.
  if (!event.licenseKeyId) {
    return { status: "skipped", reason: "LICENSE_KEY_NOT_READY" };
  }

  return sendLicenseEmailForGrant({
    grantId: event.grantId,
    licenseKeyId: event.licenseKeyId,
    customerEmail: event.customerEmail,
    customerName: event.customerName,
    planName: event.planName,
  });
}

export async function listFailedLicenseEmails() {
  const deliveries = await listPolarLicenseKeyDeliveriesWithErrors();
  return deliveries.map((delivery: PolarLicenseDelivery) => ({
    grantId: delivery.grantId,
    orderId: delivery.polarOrderId,
    customerEmail: delivery.customerEmail,
    emailError: delivery.emailError,
    updatedAt: delivery.updatedAt.toISOString(),
  }));
}

/** Admin: re-send a license email (e.g. after Polar stopped retrying the webhook). */
export async function resendLicenseEmail(grantId: string) {
  const delivery = await getPolarLicenseKeyDelivery(grantId);
  if (!delivery) {
    throw badRequest("DELIVERY_NOT_FOUND", "No license delivery exists for this grant.");
  }
  if (!delivery.polarLicenseKeyId) {
    throw badRequest("LICENSE_KEY_NOT_READY", "Polar has not issued a license key for this grant yet.");
  }
  if (!canSendLicenseEmails()) {
    throw new AppError(503, "EMAIL_NOT_CONFIGURED", "Email delivery is not configured.");
  }

  return sendLicenseEmailForGrant({
    grantId,
    resend: true,
    licenseKeyId: delivery.polarLicenseKeyId,
    customerEmail: delivery.customerEmail,
  });
}

export async function createPolarCheckout(payload: unknown) {
  const input = checkoutSchema.parse(payload);
  const products = getCheckoutProductIds(input.productIds);
  assertAllowedRedirect(input.successUrl);
  assertAllowedRedirect(input.returnUrl);

  const polar = getPolarClient();
  // Informational only (shown on the order in Polar); nothing reads it back.
  const metadata = {
    ...(input.metadata ?? {}),
    ...(input.licenseProduct ? { licenseProduct: input.licenseProduct } : {}),
    ...(input.planName ? { planName: input.planName } : {}),
    ...(typeof input.seatsAllowed === "number" ? { seatsAllowed: input.seatsAllowed } : {}),
  };
  const checkout = await polar.checkouts.create({
    products,
    successUrl: getSuccessUrl(input.successUrl),
    returnUrl: input.returnUrl ?? env.polarReturnUrl ?? undefined,
    customerEmail: input.customerEmail,
    customerName: input.customerName,
    seats: input.seats,
    metadata,
  });

  return {
    checkoutId: checkout.id,
    url: checkout.url,
    clientSecret: checkout.clientSecret,
    expiresAt: checkout.expiresAt.toISOString(),
    status: checkout.status,
  };
}

type PolarWebhookEvent = ReturnType<typeof validateEvent>;

/** Handles an already-verified Polar event. Exported for tests. */
export async function processPolarEvent(event: PolarWebhookEvent) {
  switch (event.type) {
    case "benefit_grant.created":
    case "benefit_grant.updated": {
      if (event.data.benefit.type !== "license_keys") {
        return {
          received: true,
          eventType: event.type,
          ignored: true,
        };
      }

      const properties = event.data.properties as BenefitGrantLicenseKeysProperties;

      const licenseEmail = await maybeSendPolarLicenseKeyEmail({
        grantId: event.data.id,
        orderId: event.data.orderId,
        benefitId: event.data.benefitId,
        planName: planNameFromBenefitDescription(event.data.benefit.description),
        licenseKeyId: properties.licenseKeyId,
        customerEmail: event.data.customer.email,
        customerName: event.data.customer.name,
      });

      return {
        received: true,
        eventType: event.type,
        result: {
          grantId: event.data.id,
          benefitId: event.data.benefitId,
          orderId: event.data.orderId,
          customerId: event.data.customerId,
          source: "polar",
        },
        licenseEmail,
      };
    }

    case "benefit_grant.revoked": {
      const properties = event.data.properties as BenefitGrantLicenseKeysProperties;
      if (event.data.benefit.type !== "license_keys" || !properties.licenseKeyId) {
        return {
          received: true,
          eventType: event.type,
          ignored: true,
        };
      }

      // Refunds and revoked subscriptions reach us as a revoked benefit grant.
      const revocation = await revokeLocalLicenseForPolarKey(properties.licenseKeyId);
      return {
        received: true,
        eventType: event.type,
        result: {
          grantId: event.data.id,
          ...revocation,
          source: "polar",
        },
      };
    }

    default:
      return {
        received: true,
        eventType: event.type,
        ignored: true,
      };
  }
}

export async function handlePolarWebhook(
  rawBody: Buffer,
  headers: Record<string, string | string[] | undefined>,
) {
  if (!env.polarWebhookSecret) {
    throw new Error("POLAR_WEBHOOK_SECRET is required");
  }

  const event = validateEvent(rawBody, normalizeHeaders(headers), env.polarWebhookSecret);
  return processPolarEvent(event);
}

export { WebhookVerificationError };
