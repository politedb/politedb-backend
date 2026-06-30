import { z } from 'zod';
import { env } from '../config/env';
import { getPolarClient } from '../libs/polar';
import { normalizeHeaders } from '../utils/common';
import { canSendLicenseEmails, sendLicenseIssuedEmail } from './email.service';
import {
  getPolarLicenseKeyDelivery,
  markPolarLicenseKeyEmailFailed,
  markPolarLicenseKeyEmailSent,
  upsertPolarLicenseKeyDelivery,
} from './polar-license-delivery.service';

const polarWebhookModule = require('@polar-sh/sdk/webhooks') as {
  validateEvent: typeof import('@polar-sh/sdk/dist/commonjs/webhooks.js').validateEvent;
  WebhookVerificationError: typeof import('@polar-sh/sdk/dist/commonjs/webhooks.js').WebhookVerificationError;
};

const { validateEvent, WebhookVerificationError } = polarWebhookModule;

type BenefitGrantLicenseKeysProperties = {
  licenseKeyId?: string;
};

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
    throw new Error('POLAR_PRODUCT_IDS is required unless productIds is provided');
  }

  return productIds;
}

function getSuccessUrl(requested?: string) {
  const successUrl = requested ?? env.polarSuccessUrl ?? undefined;
  if (!successUrl) {
    throw new Error('POLAR_SUCCESS_URL is required unless successUrl is provided');
  }

  return successUrl;
}

async function fetchPolarLicenseKey(licenseKeyId: string) {
  const polar = getPolarClient();
  return polar.licenseKeys.get({ id: licenseKeyId });
}

async function maybeSendPolarLicenseKeyEmail(event: {
  grantId: string;
  orderId?: string | null;
  benefitId?: string | null;
  productName?: string | null;
  planName?: string | null;
  licenseKeyId?: string | null;
  customerEmail?: string | null;
  customerName?: string | null;
}) {
  if (!event.customerEmail) {
    return {
      status: 'skipped' as const,
      reason: 'CUSTOMER_EMAIL_MISSING',
    };
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
    return {
      status: 'skipped' as const,
      reason: 'ALREADY_SENT',
    };
  }

  if (!canSendLicenseEmails()) {
    return {
      status: 'skipped' as const,
      reason: 'EMAIL_NOT_CONFIGURED',
    };
  }

  if (!event.licenseKeyId) {
    return {
      status: 'skipped' as const,
      reason: 'LICENSE_KEY_NOT_READY',
    };
  }

  try {
    const licenseKey = await fetchPolarLicenseKey(event.licenseKeyId);
    await sendLicenseIssuedEmail({
      to: event.customerEmail,
      customerName: event.customerName,
      product: event.productName?.trim() || env.defaultProduct,
      planName: event.planName?.trim() || 'Polar License',
      licenseKey: licenseKey.key,
      instanceName: null,
      seatsAllowed: licenseKey.limitActivations ?? 1,
      expiresAt: licenseKey.expiresAt?.toISOString() ?? null,
    });
    await markPolarLicenseKeyEmailSent(event.grantId);
    return {
      status: 'sent' as const,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'UNKNOWN_EMAIL_ERROR';
    await markPolarLicenseKeyEmailFailed(event.grantId, message);
    console.error(`Failed to send Polar license key email for grant ${event.grantId}: ${message}`);
    return {
      status: 'failed' as const,
      reason: message,
    };
  }
}

export async function createPolarCheckout(payload: unknown) {
  const input = checkoutSchema.parse(payload);
  const polar = getPolarClient();
  const metadata = {
    ...(input.metadata ?? {}),
    ...(input.licenseProduct ? { licenseProduct: input.licenseProduct } : {}),
    ...(input.planName ? { planName: input.planName } : {}),
    ...(input.instanceName ? { instanceName: input.instanceName } : {}),
    ...(typeof input.seatsAllowed === 'number' ? { seatsAllowed: input.seatsAllowed } : {}),
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
    throw new Error('POLAR_WEBHOOK_SECRET is required');
  }

  const event = validateEvent(rawBody, normalizeHeaders(headers), env.polarWebhookSecret);

  switch (event.type) {
    case 'benefit_grant.created': {
      if (event.data.benefit.type !== 'license_keys') {
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
        productName: 'PoliteDB',
        planName: event.data.benefit.description.replace('License Key', ''),
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
          source: 'polar',
        },
        licenseEmail,
      };
    }

    case 'order.paid':
      return {
        received: true,
        eventType: event.type,
        result: {
          orderId: event.data.id,
          status: 'received',
          source: 'polar',
        },
      };

    case 'order.refunded':
      return {
        received: true,
        eventType: event.type,
        result: {
          orderId: event.data.id,
          status: 'received',
          source: 'polar',
        },
      };

    case 'subscription.revoked':
      return {
        received: true,
        eventType: event.type,
        result: {
          subscriptionId: event.data.id,
          status: 'received',
          source: 'polar',
        },
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
