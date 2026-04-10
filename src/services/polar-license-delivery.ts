import { db } from "../db/database";

type PolarLicenseDeliveryRow = {
  grant_id: string;
  polar_order_id: string | null;
  polar_benefit_id: string | null;
  polar_license_key_id: string | null;
  customer_email: string;
  email_sent_at: number | null;
  email_error: string | null;
  created_at: number;
  updated_at: number;
};

function now() {
  return Date.now();
}

export function upsertPolarLicenseKeyDelivery(input: {
  grantId: string;
  orderId?: string | null;
  benefitId?: string | null;
  licenseKeyId?: string | null;
  customerEmail: string;
}) {
  const existing = db
    .prepare("SELECT * FROM polar_license_key_deliveries WHERE grant_id = ?")
    .get(input.grantId) as PolarLicenseDeliveryRow | undefined;
  const timestamp = now();

  db.prepare(
    `
    INSERT INTO polar_license_key_deliveries (
      grant_id, polar_order_id, polar_benefit_id, polar_license_key_id,
      customer_email, email_sent_at, email_error, created_at, updated_at
    ) VALUES (
      @grant_id, @polar_order_id, @polar_benefit_id, @polar_license_key_id,
      @customer_email, @email_sent_at, @email_error, @created_at, @updated_at
    )
    ON CONFLICT(grant_id) DO UPDATE SET
      polar_order_id = excluded.polar_order_id,
      polar_benefit_id = excluded.polar_benefit_id,
      polar_license_key_id = excluded.polar_license_key_id,
      customer_email = excluded.customer_email,
      updated_at = excluded.updated_at
  `,
  ).run({
    grant_id: input.grantId,
    polar_order_id: input.orderId ?? null,
    polar_benefit_id: input.benefitId ?? null,
    polar_license_key_id: input.licenseKeyId ?? null,
    customer_email: input.customerEmail,
    email_sent_at: existing?.email_sent_at ?? null,
    email_error: existing?.email_error ?? null,
    created_at: existing?.created_at ?? timestamp,
    updated_at: timestamp,
  });
}

export function getPolarLicenseKeyDelivery(grantId: string) {
  return db
    .prepare("SELECT * FROM polar_license_key_deliveries WHERE grant_id = ?")
    .get(grantId) as PolarLicenseDeliveryRow | undefined;
}

export function markPolarLicenseKeyEmailSent(grantId: string) {
  db.prepare(
    `
    UPDATE polar_license_key_deliveries
    SET email_sent_at = ?, email_error = NULL, updated_at = ?
    WHERE grant_id = ?
  `,
  ).run(now(), now(), grantId);
}

export function markPolarLicenseKeyEmailFailed(grantId: string, error: string) {
  db.prepare(
    `
    UPDATE polar_license_key_deliveries
    SET email_error = ?, updated_at = ?
    WHERE grant_id = ?
  `,
  ).run(error, now(), grantId);
}
