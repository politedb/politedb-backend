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

/** Deliveries whose last send attempt failed and that have not been sent since. */
export async function listPolarLicenseKeyDeliveriesWithErrors() {
  return getEm().find(
    PolarLicenseDelivery,
    { emailSentAt: null, emailError: { $ne: null } },
    { orderBy: { updatedAt: "DESC" } },
  );
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
  // Column is varchar(255); SMTP errors can be longer.
  delivery.emailError = error.slice(0, 255);
  delivery.updatedAt = now();
  await em.flush();
}
