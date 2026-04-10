import { z } from "zod";
import { db } from "../db/database";
import { env } from "../config/env";
import { createActivationToken, createId, createLicenseKey } from "../utils/license-key";

const deviceSchema = z.object({
  device_id: z.string().min(1),
  device_name: z.string().min(1),
  platform: z.string().min(1),
  arch: z.string().min(1),
});

const createLicenseSchema = z.object({
  product: z.string().min(1).default(env.defaultProduct),
  planName: z.string().min(1),
  customerEmail: z.email(),
  instanceName: z.string().trim().optional(),
  seatsAllowed: z.int().positive().default(1),
  expiresAt: z.iso.datetime().optional(),
  notes: z.string().trim().optional(),
  licenseKey: z.string().trim().optional(),
});

const activateSchema = z.object({
  product: z.string().min(1),
  licenseKey: z.string().min(1),
  device: deviceSchema,
});

const validateSchema = z.object({
  product: z.string().min(1),
  activationToken: z.string().min(1),
  device: deviceSchema,
});

const deactivateSchema = z
  .object({
    product: z.string().min(1),
    activationToken: z.string().optional(),
    licenseKey: z.string().optional(),
    device: deviceSchema,
  })
  .refine((value) => value.activationToken || value.licenseKey, {
    message: "activationToken or licenseKey is required",
    path: ["activationToken"],
  });

type LicenseRow = {
  id: string;
  product: string;
  license_key: string;
  plan_name: string;
  customer_email: string;
  instance_name: string | null;
  seats_allowed: number;
  expires_at: string | null;
  status: string;
  notes: string | null;
  created_at: number;
  updated_at: number;
};

type ActivationRow = {
  id: string;
  license_id: string;
  activation_token: string;
  device_id: string;
  device_name: string;
  platform: string;
  arch: string;
  status: string;
  activated_at: number;
  last_validated_at: number;
  deactivated_at: number | null;
};

type PolarTransactionRow = {
  id: string;
  polar_order_id: string;
  polar_checkout_id: string | null;
  polar_subscription_id: string | null;
  polar_customer_id: string;
  polar_product_id: string | null;
  external_customer_id: string | null;
  license_id: string;
  event_type: string;
  status: string;
  license_email_sent_at: number | null;
  license_email_error: string | null;
  metadata_json: string | null;
  created_at: number;
  updated_at: number;
};

export type PolarLicenseSyncInput = {
  orderId: string;
  checkoutId?: string | null;
  subscriptionId?: string | null;
  customerId: string;
  productId?: string | null;
  externalCustomerId?: string | null;
  customerEmail: string;
  customerName?: string | null;
  productName?: string | null;
  seats?: number | null;
  currentPeriodEnd?: string | null;
  metadata?: Record<string, unknown>;
};

function now() {
  return Date.now();
}

function isExpired(expiresAt: string | null) {
  return Boolean(expiresAt && new Date(expiresAt).getTime() <= now());
}

function getLicenseByKey(product: string, licenseKey: string) {
  return db
    .prepare("SELECT * FROM licenses WHERE product = ? AND license_key = ?")
    .get(product, licenseKey) as LicenseRow | undefined;
}

function getLicenseById(licenseId: string) {
  return db.prepare("SELECT * FROM licenses WHERE id = ?").get(licenseId) as LicenseRow | undefined;
}

function getPolarTransactionByOrderId(orderId: string) {
  return db.prepare("SELECT * FROM polar_transactions WHERE polar_order_id = ?").get(orderId) as
    | PolarTransactionRow
    | undefined;
}

function getLatestPolarTransactionBySubscriptionId(subscriptionId: string) {
  return db
    .prepare(
      `
      SELECT * FROM polar_transactions
      WHERE polar_subscription_id = ?
      ORDER BY created_at DESC
      LIMIT 1
    `,
    )
    .get(subscriptionId) as PolarTransactionRow | undefined;
}

function getActivationByToken(token: string) {
  return db.prepare("SELECT * FROM activations WHERE activation_token = ?").get(token) as
    | ActivationRow
    | undefined;
}

function countActiveDevices(licenseId: string) {
  const row = db
    .prepare("SELECT COUNT(*) as count FROM activations WHERE license_id = ? AND status = 'active'")
    .get(licenseId) as { count: number };

  return row.count;
}

function getActiveActivationForDevice(licenseId: string, deviceId: string) {
  return db
    .prepare(
      "SELECT * FROM activations WHERE license_id = ? AND device_id = ? AND status = 'active'",
    )
    .get(licenseId, deviceId) as ActivationRow | undefined;
}

function assertLicenseUsable(license: LicenseRow | undefined): asserts license is LicenseRow {
  if (!license) {
    throw new Error("LICENSE_NOT_FOUND");
  }

  if (license.status !== "active") {
    throw new Error("LICENSE_NOT_ACTIVE");
  }

  if (isExpired(license.expires_at)) {
    throw new Error("LICENSE_EXPIRED");
  }
}

function requireUsableLicense(license: LicenseRow | undefined): LicenseRow {
  assertLicenseUsable(license);
  return license;
}

function buildState(license: LicenseRow, activation: ActivationRow | null, message?: string) {
  return {
    status: activation ? "active" : "inactive",
    licenseId: license.id,
    licenseKey: license.license_key,
    activationToken: activation?.activation_token ?? null,
    planName: license.plan_name,
    customerEmail: license.customer_email,
    instanceName: license.instance_name,
    expiresAt: license.expires_at,
    activatedAt: activation?.activated_at ?? null,
    lastValidatedAt: activation?.last_validated_at ?? null,
    seatsAllowed: license.seats_allowed,
    devicesUsed: countActiveDevices(license.id),
    message: message ?? null,
  };
}

export function createLicense(payload: unknown) {
  const input = createLicenseSchema.parse(payload);
  const timestamp = now();
  const license = {
    id: createId(),
    product: input.product,
    license_key: input.licenseKey ?? createLicenseKey("PLD"),
    plan_name: input.planName,
    customer_email: input.customerEmail,
    instance_name: input.instanceName ?? null,
    seats_allowed: input.seatsAllowed,
    expires_at: input.expiresAt ?? null,
    status: "active",
    notes: input.notes ?? null,
    created_at: timestamp,
    updated_at: timestamp,
  };

  db.prepare(
    `
    INSERT INTO licenses (
      id, product, license_key, plan_name, customer_email, instance_name,
      seats_allowed, expires_at, status, notes, created_at, updated_at
    ) VALUES (
      @id, @product, @license_key, @plan_name, @customer_email, @instance_name,
      @seats_allowed, @expires_at, @status, @notes, @created_at, @updated_at
    )
  `,
  ).run(license);

  return {
    licenseId: license.id,
    product: license.product,
    licenseKey: license.license_key,
    planName: license.plan_name,
    customerEmail: license.customer_email,
    instanceName: license.instance_name,
    seatsAllowed: license.seats_allowed,
    expiresAt: license.expires_at,
    status: license.status,
    notes: license.notes,
    createdAt: license.created_at,
  };
}

function insertLicenseRecord(input: {
  product: string;
  planName: string;
  customerEmail: string;
  instanceName?: string | null;
  seatsAllowed: number;
  expiresAt?: string | null;
  notes?: string | null;
}) {
  const timestamp = now();
  const record = {
    id: createId(),
    product: input.product,
    license_key: createLicenseKey("PLD"),
    plan_name: input.planName,
    customer_email: input.customerEmail,
    instance_name: input.instanceName ?? null,
    seats_allowed: input.seatsAllowed,
    expires_at: input.expiresAt ?? null,
    status: "active",
    notes: input.notes ?? null,
    created_at: timestamp,
    updated_at: timestamp,
  };

  db.prepare(
    `
    INSERT INTO licenses (
      id, product, license_key, plan_name, customer_email, instance_name,
      seats_allowed, expires_at, status, notes, created_at, updated_at
    ) VALUES (
      @id, @product, @license_key, @plan_name, @customer_email, @instance_name,
      @seats_allowed, @expires_at, @status, @notes, @created_at, @updated_at
    )
  `,
  ).run(record);

  return record;
}

function normalizeString(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizePositiveInt(value: unknown) {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isInteger(parsed) && parsed > 0) {
      return parsed;
    }
  }

  return null;
}

function normalizeIsoDate(value: unknown) {
  if (typeof value === "string") {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) {
      return date.toISOString();
    }
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }

  return null;
}

function buildPolarLicensePayload(input: PolarLicenseSyncInput) {
  const metadata = input.metadata ?? {};
  const product = normalizeString(metadata.licenseProduct) ?? env.defaultProduct;
  const planName = normalizeString(metadata.planName) ?? input.productName ?? "Polar Purchase";
  const instanceName = normalizeString(metadata.instanceName) ?? input.customerName ?? null;
  const seatsAllowed = normalizePositiveInt(metadata.seatsAllowed) ?? input.seats ?? 1;
  const expiresAt =
    normalizeIsoDate(metadata.expiresAt) ?? normalizeIsoDate(input.currentPeriodEnd);

  return {
    product,
    planName,
    customerEmail: input.customerEmail,
    instanceName,
    seatsAllowed,
    expiresAt,
    notes: `Issued from Polar order ${input.orderId}`,
  };
}

function upsertPolarTransaction(input: PolarLicenseSyncInput, licenseId: string, status: string) {
  const existing = getPolarTransactionByOrderId(input.orderId);
  const timestamp = now();
  const payload = {
    id: existing?.id ?? createId(),
    polar_order_id: input.orderId,
    polar_checkout_id: input.checkoutId ?? null,
    polar_subscription_id: input.subscriptionId ?? null,
    polar_customer_id: input.customerId,
    polar_product_id: input.productId ?? null,
    external_customer_id: input.externalCustomerId ?? null,
    license_id: licenseId,
    event_type: "order.paid",
    status,
    license_email_sent_at: existing?.license_email_sent_at ?? null,
    license_email_error: existing?.license_email_error ?? null,
    metadata_json: JSON.stringify(input.metadata ?? {}),
    created_at: existing?.created_at ?? timestamp,
    updated_at: timestamp,
  };

  db.prepare(
    `
    INSERT INTO polar_transactions (
      id, polar_order_id, polar_checkout_id, polar_subscription_id, polar_customer_id,
      polar_product_id, external_customer_id, license_id, event_type, status,
      license_email_sent_at, license_email_error, metadata_json, created_at, updated_at
    ) VALUES (
      @id, @polar_order_id, @polar_checkout_id, @polar_subscription_id, @polar_customer_id,
      @polar_product_id, @external_customer_id, @license_id, @event_type, @status,
      @license_email_sent_at, @license_email_error, @metadata_json, @created_at, @updated_at
    )
    ON CONFLICT(polar_order_id) DO UPDATE SET
      polar_checkout_id = excluded.polar_checkout_id,
      polar_subscription_id = excluded.polar_subscription_id,
      polar_customer_id = excluded.polar_customer_id,
      polar_product_id = excluded.polar_product_id,
      external_customer_id = excluded.external_customer_id,
      license_id = excluded.license_id,
      event_type = excluded.event_type,
      status = excluded.status,
      license_email_sent_at = excluded.license_email_sent_at,
      license_email_error = excluded.license_email_error,
      metadata_json = excluded.metadata_json,
      updated_at = excluded.updated_at
  `,
  ).run(payload);
}

export function issueLicenseFromPolarOrder(input: PolarLicenseSyncInput) {
  const existingOrder = getPolarTransactionByOrderId(input.orderId);
  if (existingOrder) {
    const existingLicense = getLicenseById(existingOrder.license_id);
    if (existingLicense) {
      return {
        licenseId: existingLicense.id,
        licenseKey: existingLicense.license_key,
        product: existingLicense.product,
        status: existingLicense.status,
        source: "polar",
      };
    }
  }

  const payload = buildPolarLicensePayload(input);
  let license = input.subscriptionId
    ? (() => {
        const latest = getLatestPolarTransactionBySubscriptionId(input.subscriptionId);
        return latest ? getLicenseById(latest.license_id) : undefined;
      })()
    : undefined;

  if (license) {
    db.prepare(
      `
      UPDATE licenses
      SET product = ?, plan_name = ?, customer_email = ?, instance_name = ?,
          seats_allowed = ?, expires_at = ?, status = 'active', notes = ?, updated_at = ?
      WHERE id = ?
    `,
    ).run(
      payload.product,
      payload.planName,
      payload.customerEmail,
      payload.instanceName,
      payload.seatsAllowed,
      payload.expiresAt ?? null,
      payload.notes,
      now(),
      license.id,
    );

    license = getLicenseById(license.id);
  } else {
    license = insertLicenseRecord(payload);
  }

  const usableLicense = requireUsableLicense(license);
  upsertPolarTransaction(input, usableLicense.id, "paid");

  return {
    licenseId: usableLicense.id,
    licenseKey: usableLicense.license_key,
    product: usableLicense.product,
    status: usableLicense.status,
    source: "polar",
  };
}

export function getPolarOrderEmailDelivery(orderId: string) {
  const tx = getPolarTransactionByOrderId(orderId);
  if (!tx) {
    throw new Error("POLAR_ORDER_NOT_LINKED");
  }

  const license = getLicenseById(tx.license_id);
  if (!license) {
    throw new Error("LICENSE_NOT_FOUND");
  }

  return {
    orderId,
    customerEmail: license.customer_email,
    instanceName: license.instance_name,
    planName: license.plan_name,
    product: license.product,
    licenseKey: license.license_key,
    seatsAllowed: license.seats_allowed,
    expiresAt: license.expires_at,
    emailSentAt: tx.license_email_sent_at,
    emailError: tx.license_email_error,
  };
}

export function markPolarOrderLicenseEmailSent(orderId: string) {
  db.prepare(
    `
    UPDATE polar_transactions
    SET license_email_sent_at = ?, license_email_error = NULL, updated_at = ?
    WHERE polar_order_id = ?
  `,
  ).run(now(), now(), orderId);
}

export function markPolarOrderLicenseEmailFailed(orderId: string, error: string) {
  db.prepare(
    `
    UPDATE polar_transactions
    SET license_email_error = ?, updated_at = ?
    WHERE polar_order_id = ?
  `,
  ).run(error, now(), orderId);
}

export function listLicenses() {
  const rows = db.prepare("SELECT * FROM licenses ORDER BY created_at DESC").all() as LicenseRow[];

  return rows.map((license) => ({
    licenseId: license.id,
    product: license.product,
    licenseKey: license.license_key,
    planName: license.plan_name,
    customerEmail: license.customer_email,
    instanceName: license.instance_name,
    seatsAllowed: license.seats_allowed,
    devicesUsed: countActiveDevices(license.id),
    expiresAt: license.expires_at,
    status: license.status,
    createdAt: license.created_at,
    updatedAt: license.updated_at,
  }));
}

export function activateLicense(payload: unknown) {
  const input = activateSchema.parse(payload);
  const license = requireUsableLicense(getLicenseByKey(input.product, input.licenseKey));

  const existing = getActiveActivationForDevice(license.id, input.device.device_id);
  if (existing) {
    db.prepare("UPDATE activations SET last_validated_at = ? WHERE id = ?").run(now(), existing.id);
    return buildState(
      license,
      { ...existing, last_validated_at: now() },
      "Device already activated",
    );
  }

  const devicesUsed = countActiveDevices(license.id);
  if (devicesUsed >= license.seats_allowed) {
    throw new Error("SEAT_LIMIT_REACHED");
  }

  const activation: ActivationRow = {
    id: createId(),
    license_id: license.id,
    activation_token: createActivationToken(),
    device_id: input.device.device_id,
    device_name: input.device.device_name,
    platform: input.device.platform,
    arch: input.device.arch,
    status: "active",
    activated_at: now(),
    last_validated_at: now(),
    deactivated_at: null,
  };

  db.prepare(
    `
    INSERT INTO activations (
      id, license_id, activation_token, device_id, device_name, platform, arch,
      status, activated_at, last_validated_at, deactivated_at
    ) VALUES (
      @id, @license_id, @activation_token, @device_id, @device_name, @platform, @arch,
      @status, @activated_at, @last_validated_at, @deactivated_at
    )
  `,
  ).run(activation);

  return buildState(license, activation, "License activated");
}

export function validateLicense(payload: unknown) {
  const input = validateSchema.parse(payload);
  const activation = getActivationByToken(input.activationToken);

  if (!activation || activation.status !== "active") {
    throw new Error("ACTIVATION_NOT_FOUND");
  }

  if (activation.device_id !== input.device.device_id) {
    throw new Error("DEVICE_MISMATCH");
  }

  const license = requireUsableLicense(
    db.prepare("SELECT * FROM licenses WHERE id = ?").get(activation.license_id) as
      | LicenseRow
      | undefined,
  );

  if (license.product !== input.product) {
    throw new Error("PRODUCT_MISMATCH");
  }

  const validatedAt = now();
  db.prepare("UPDATE activations SET last_validated_at = ? WHERE id = ?").run(
    validatedAt,
    activation.id,
  );

  return buildState(license, { ...activation, last_validated_at: validatedAt }, "License valid");
}

export function deactivateLicense(payload: unknown) {
  const input = deactivateSchema.parse(payload);

  const activation = input.activationToken
    ? getActivationByToken(input.activationToken)
    : undefined;

  let license: LicenseRow | undefined;
  let targetActivation = activation;

  if (!targetActivation && input.licenseKey) {
    license = requireUsableLicense(getLicenseByKey(input.product, input.licenseKey));
    targetActivation = getActiveActivationForDevice(license.id, input.device.device_id);
  }

  if (!targetActivation) {
    throw new Error("ACTIVATION_NOT_FOUND");
  }

  if (targetActivation.device_id !== input.device.device_id) {
    throw new Error("DEVICE_MISMATCH");
  }

  license = requireUsableLicense(
    license ??
      (db.prepare("SELECT * FROM licenses WHERE id = ?").get(targetActivation.license_id) as
        | LicenseRow
        | undefined),
  );

  db.prepare(
    `
    UPDATE activations
    SET status = 'inactive', deactivated_at = ?, last_validated_at = ?
    WHERE id = ?
  `,
  ).run(now(), now(), targetActivation.id);

  return buildState(license, null, "License deactivated");
}

export function revokeLicense(licenseId: string) {
  const license = db.prepare("SELECT * FROM licenses WHERE id = ?").get(licenseId) as
    | LicenseRow
    | undefined;
  if (!license) {
    throw new Error("LICENSE_NOT_FOUND");
  }

  db.prepare("UPDATE licenses SET status = 'revoked', updated_at = ? WHERE id = ?").run(
    now(),
    licenseId,
  );
  db.prepare(
    "UPDATE activations SET status = 'inactive', deactivated_at = ? WHERE license_id = ? AND status = 'active'",
  ).run(now(), licenseId);

  return {
    licenseId,
    status: "revoked",
  };
}

function revokeLicenseById(licenseId: string) {
  const license = getLicenseById(licenseId);
  if (!license) {
    throw new Error("LICENSE_NOT_FOUND");
  }

  db.prepare("UPDATE licenses SET status = 'revoked', updated_at = ? WHERE id = ?").run(
    now(),
    licenseId,
  );
  db.prepare(
    `
    UPDATE activations
    SET status = 'inactive', deactivated_at = ?, last_validated_at = ?
    WHERE license_id = ? AND status = 'active'
  `,
  ).run(now(), now(), licenseId);

  return {
    licenseId,
    status: "revoked",
  };
}

export function revokeLicenseFromPolarOrder(orderId: string) {
  const tx = getPolarTransactionByOrderId(orderId);
  if (!tx) {
    return {
      orderId,
      status: "ignored",
      reason: "POLAR_ORDER_NOT_LINKED",
    };
  }

  db.prepare(
    "UPDATE polar_transactions SET status = ?, updated_at = ? WHERE polar_order_id = ?",
  ).run("refunded", now(), orderId);

  const revoked = revokeLicenseById(tx.license_id);
  return {
    ...revoked,
    orderId,
    source: "polar",
  };
}

export function revokeLicenseFromPolarSubscription(subscriptionId: string) {
  const tx = getLatestPolarTransactionBySubscriptionId(subscriptionId);
  if (!tx) {
    return {
      subscriptionId,
      status: "ignored",
      reason: "POLAR_SUBSCRIPTION_NOT_LINKED",
    };
  }

  db.prepare(
    "UPDATE polar_transactions SET status = ?, updated_at = ? WHERE polar_subscription_id = ?",
  ).run("revoked", now(), subscriptionId);

  const revoked = revokeLicenseById(tx.license_id);
  return {
    ...revoked,
    subscriptionId,
    source: "polar",
  };
}
