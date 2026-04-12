import { PolarLicenseDelivery } from "../db/entities";
import { getEm } from "../db/orm";

function now() {
  return new Date();
}

export async function upsertPolarLicenseKeyDelivery(input: {
  grantId: string;
  orderId?: string | null;
  benefitId?: string | null;
  licenseKeyId?: string | null;
  customerEmail: string;
}) {
  const em = getEm();
  let delivery = await em.findOne(PolarLicenseDelivery, { grantId: input.grantId });

  if (!delivery) {
    delivery = em.create(PolarLicenseDelivery, {
      grantId: input.grantId,
      customerEmail: input.customerEmail,
      createdAt: now(),
      updatedAt: now(),
      emailSentAt: null,
      emailError: null,
    });
  }

  delivery.polarOrderId = input.orderId ?? null;
  delivery.polarBenefitId = input.benefitId ?? null;
  delivery.polarLicenseKeyId = input.licenseKeyId ?? null;
  delivery.customerEmail = input.customerEmail;
  delivery.updatedAt = now();

  em.persist(delivery);
  await em.flush();
}

export async function getPolarLicenseKeyDelivery(grantId: string) {
  return getEm().findOne(PolarLicenseDelivery, { grantId });
}

export async function markPolarLicenseKeyEmailSent(grantId: string) {
  const em = getEm();
  const delivery = await em.findOneOrFail(PolarLicenseDelivery, { grantId });
  delivery.emailSentAt = now();
  delivery.emailError = null;
  delivery.updatedAt = now();
  await em.flush();
}

export async function markPolarLicenseKeyEmailFailed(grantId: string, error: string) {
  const em = getEm();
  const delivery = await em.findOneOrFail(PolarLicenseDelivery, { grantId });
  delivery.emailError = error;
  delivery.updatedAt = now();
  await em.flush();
}
