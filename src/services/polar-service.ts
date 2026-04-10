import { z } from "zod";
import { env } from "../config/env";
import {
  getPolarOrderEmailDelivery,
  issueLicenseFromPolarOrder,
  markPolarOrderLicenseEmailFailed,
  markPolarOrderLicenseEmailSent,
  revokeLicenseFromPolarOrder,
  revokeLicenseFromPolarSubscription,
} from "./license-service";
import { getPolarClient } from "../libs/polar";
import { normalizeHeaders } from "../utils/common";
import { canSendLicenseEmails, sendLicenseIssuedEmail } from "./email-service";

const polarWebhookModule = require("@polar-sh/sdk/webhooks") as {
  validateEvent: typeof import("@polar-sh/sdk/dist/commonjs/webhooks.js").validateEvent;
  WebhookVerificationError: typeof import("@polar-sh/sdk/dist/commonjs/webhooks.js").WebhookVerificationError;
};

const { validateEvent, WebhookVerificationError } = polarWebhookModule;

const checkoutSchema = z.object({
  productIds: z.array(z.string().min(1)).min(1).optional(),
  successUrl: z.url().optional(),
  returnUrl: z.url().optional(),
  customerEmail: z.email().optional(),
  customerName: z.string().trim().min(1).optional(),
  externalCustomerId: z.string().trim().min(1).optional(),
  customerId: z.string().trim().min(1).optional(),
  seats: z.int().positive().optional(),
  metadata: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
  licenseProduct: z.string().trim().min(1).optional(),
  planName: z.string().trim().min(1).optional(),
  instanceName: z.string().trim().min(1).optional(),
  seatsAllowed: z.int().positive().optional(),
  expiresAt: z.iso.datetime().optional(),
});

function getCheckoutProductIds(requested?: string[]) {
  const productIds = requested?.length ? requested : env.polarProductIds;
  if (!productIds.length) {
    throw new Error("POLAR_PRODUCT_IDS is required unless productIds is provided");
  }

  return productIds;
}

function getSuccessUrl(requested?: string) {
  const successUrl = requested ?? env.polarSuccessUrl ?? undefined;
  if (!successUrl) {
    throw new Error("POLAR_SUCCESS_URL is required unless successUrl is provided");
  }

  return successUrl;
}

export async function createPolarCheckout(payload: unknown) {
  const input = checkoutSchema.parse(payload);
  const polar = getPolarClient();
  const metadata = {
    ...(input.metadata ?? {}),
    ...(input.licenseProduct ? { licenseProduct: input.licenseProduct } : {}),
    ...(input.planName ? { planName: input.planName } : {}),
    ...(input.instanceName ? { instanceName: input.instanceName } : {}),
    ...(typeof input.seatsAllowed === "number" ? { seatsAllowed: input.seatsAllowed } : {}),
    ...(input.expiresAt ? { expiresAt: input.expiresAt } : {}),
  };

  const checkout = await polar.checkouts.create({
    products: getCheckoutProductIds(input.productIds),
    successUrl: getSuccessUrl(input.successUrl),
    returnUrl: input.returnUrl ?? env.polarReturnUrl ?? undefined,
    customerEmail: input.customerEmail,
    customerName: input.customerName,
    externalCustomerId: input.externalCustomerId,
    customerId: input.customerId,
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

export async function handlePolarWebhook(
  rawBody: Buffer,
  headers: Record<string, string | string[] | undefined>,
) {
  if (!env.polarWebhookSecret) {
    throw new Error("POLAR_WEBHOOK_SECRET is required");
  }

  const event = validateEvent(rawBody, normalizeHeaders(headers), env.polarWebhookSecret);

  switch (event.type) {
    case "order.paid":
      if (!event.data.customer.email) {
        throw new Error("POLAR_CUSTOMER_EMAIL_MISSING");
      }

      const result = issueLicenseFromPolarOrder({
        orderId: event.data.id,
        checkoutId: event.data.checkoutId,
        subscriptionId: event.data.subscriptionId,
        customerId: event.data.customerId,
        productId: event.data.productId,
        externalCustomerId: event.data.customer.externalId ?? null,
        customerEmail: event.data.customer.email,
        customerName: event.data.customer.name,
        productName: event.data.product?.name ?? null,
        seats: event.data.seats ?? event.data.subscription?.seats ?? null,
        currentPeriodEnd: event.data.subscription?.currentPeriodEnd?.toISOString() ?? null,
        metadata: event.data.metadata,
      });

      const emailDelivery = getPolarOrderEmailDelivery(event.data.id);
      let licenseEmail: { status: "sent" | "skipped" | "failed"; reason?: string } = {
        status: "skipped",
        reason: "ALREADY_SENT",
      };

      if (!emailDelivery.emailSentAt) {
        if (!canSendLicenseEmails()) {
          licenseEmail = {
            status: "skipped",
            reason: "EMAIL_NOT_CONFIGURED",
          };
        } else {
          try {
            await sendLicenseIssuedEmail({
              to: emailDelivery.customerEmail,
              customerName: event.data.customer.name,
              product: emailDelivery.product,
              planName: emailDelivery.planName,
              licenseKey: emailDelivery.licenseKey,
              instanceName: emailDelivery.instanceName,
              seatsAllowed: emailDelivery.seatsAllowed,
              expiresAt: emailDelivery.expiresAt,
            });
            markPolarOrderLicenseEmailSent(event.data.id);
            licenseEmail = {
              status: "sent",
            };
          } catch (error) {
            const message = error instanceof Error ? error.message : "UNKNOWN_EMAIL_ERROR";
            markPolarOrderLicenseEmailFailed(event.data.id, message);
            console.error(
              `Failed to send license email for Polar order ${event.data.id}: ${message}`,
            );
            licenseEmail = {
              status: "failed",
              reason: message,
            };
          }
        }
      }

      return {
        received: true,
        eventType: event.type,
        result,
        licenseEmail,
      };

    case "order.refunded":
      return {
        received: true,
        eventType: event.type,
        result: revokeLicenseFromPolarOrder(event.data.id),
      };

    case "subscription.revoked":
      return {
        received: true,
        eventType: event.type,
        result: revokeLicenseFromPolarSubscription(event.data.id),
      };

    default:
      return {
        received: true,
        eventType: event.type,
        ignored: true,
      };
  }
}

export { WebhookVerificationError };
