import { z } from "zod";
import { PolarError } from "@polar-sh/sdk/models/errors/polarerror.js";
import type { ValidatedLicenseKey } from "@polar-sh/sdk/models/components/validatedlicensekey.js";
import { env } from "../config/env";
import { Activation, License } from "../db/entities";
import { getEm } from "../db/orm";
import { badRequest, forbidden } from "../errors";
import { getPolarClient } from "../libs/polar";
import { createId } from "../utils/license-key";

const deviceSchema = z.object({
  device_id: z.string().min(1),
  device_name: z.string().min(1),
  platform: z.string().min(1),
  arch: z.string().min(1),
});

const activateSchema = z.object({
  product: z.string().min(1),
  licenseKey: z.string().min(1),
  device: deviceSchema,
});

const validateSchema = z.object({
  product: z.string().min(1),
  activationToken: z.string().min(1),
  licenseKey: z.string().min(1),
  device: deviceSchema,
});

const deactivateSchema = z
  .object({
    product: z.string().min(1),
    activationToken: z.string().optional(),
    licenseKey: z.string().optional(),
    device: deviceSchema.optional(),
  })
  .refine((value) => value.activationToken || value.licenseKey, {
    message: "activationToken or licenseKey is required",
    path: ["activationToken"],
  });

type PolarClient = ReturnType<typeof getPolarClient>;
type DeviceInput = z.infer<typeof deviceSchema>;
type ActivateInput = z.infer<typeof activateSchema>;
type ActivationResult = Awaited<ReturnType<PolarClient["licenseKeys"]["activate"]>>;

/** Status reported to the app. Anything other than "active" is treated as not licensed. */
type LicenseStatus = "active" | "inactive" | "revoked" | "disabled" | "expired";

const STATUS_MESSAGES: Record<LicenseStatus, string> = {
  active: "License valid",
  inactive: "This device is no longer activated for this license.",
  revoked: "This license has been revoked.",
  disabled: "This license has been disabled.",
  expired: "This license has expired.",
};

function getOrganizationId() {
  if (!env.polarOrganizationId) {
    throw new Error("POLAR_ORGANIZATION_ID is required");
  }

  return env.polarOrganizationId;
}

function buildActivationLabel(device: DeviceInput) {
  return `${device.device_name} (${device.platform}/${device.arch})`;
}

function buildActivationMeta(device: DeviceInput) {
  return {
    device_id: device.device_id,
    device_name: device.device_name,
    platform: device.platform,
    arch: device.arch,
  };
}

function buildActivationConditions(device: DeviceInput) {
  return {
    device_id: device.device_id,
    platform: device.platform,
    arch: device.arch,
  };
}

function isPolarNotFound(error: unknown) {
  return error instanceof PolarError && error.statusCode === 404;
}

/** Key-level status from Polar, ignoring whether this device holds an activation. */
function keyStatus(key: Pick<ValidatedLicenseKey, "status" | "expiresAt">): LicenseStatus {
  if (key.status === "revoked") {
    return "revoked";
  }
  if (key.status !== "granted") {
    return "disabled";
  }
  if (key.expiresAt && key.expiresAt.getTime() <= Date.now()) {
    return "expired";
  }
  return "active";
}

function assertLicenseUsable(key: Pick<ValidatedLicenseKey, "status" | "expiresAt">) {
  const status = keyStatus(key);
  if (status !== "active") {
    throw forbidden(`LICENSE_${status.toUpperCase()}`, STATUS_MESSAGES[status]);
  }
}

function mapActivationResponse(
  product: string,
  licenseKey: string,
  planName: string,
  activation: ActivationResult,
  devicesUsed: number,
) {
  return {
    status: "active",
    licenseId: activation.licenseKey.id,
    licenseKey,
    activationToken: activation.id,
    planName,
    customerEmail: activation.licenseKey.customer.email,
    instanceName: activation.label,
    expiresAt: activation.licenseKey.expiresAt?.toISOString() ?? null,
    activatedAt: activation.createdAt.getTime(),
    lastValidatedAt: activation.modifiedAt?.getTime() ?? activation.createdAt.getTime(),
    seatsAllowed: activation.licenseKey.limitActivations ?? null,
    devicesUsed,
    product,
    message: "License activated",
    source: "polar",
  };
}

function mapValidatedResponse(
  product: string,
  licenseKey: string,
  planName: string,
  validated: ValidatedLicenseKey,
  devicesUsed: number | null,
) {
  const fromKey = keyStatus(validated);
  const status: LicenseStatus = fromKey !== "active" ? fromKey : validated.activation ? "active" : "inactive";

  return {
    status,
    licenseId: validated.id,
    licenseKey,
    activationToken: validated.activation?.id ?? null,
    planName,
    customerEmail: validated.customer.email,
    instanceName: validated.activation?.label ?? null,
    expiresAt: validated.expiresAt?.toISOString() ?? null,
    activatedAt: validated.activation?.createdAt.getTime() ?? null,
    lastValidatedAt: validated.lastValidatedAt?.getTime() ?? null,
    seatsAllowed: validated.limitActivations,
    devicesUsed,
    product,
    message: STATUS_MESSAGES[status],
    source: "polar",
  };
}

async function countActiveDevicesForLicenseKey(licenseKey: string) {
  const em = getEm();
  const license = await em.findOne(License, { licenseKey });
  if (!license) {
    return null;
  }

  return em.count(Activation, { license: license.id, status: "active" });
}

/**
 * Releases any activation this device already holds, on Polar and in our DB, so the
 * device can activate again after losing its activation token (reinstall, data reset,
 * or a second distribution flavor on the same Mac). The same device never holds more
 * than one seat.
 */
async function releaseDeviceActivations(input: ActivateInput, licenseKeyId: string, polar: PolarClient) {
  const key = await polar.licenseKeys.get({ id: licenseKeyId });
  const sameDevice = key.activations.filter(
    (activation) => activation.meta?.device_id === input.device.device_id,
  );

  for (const activation of sameDevice) {
    try {
      await polar.licenseKeys.deactivate({
        key: input.licenseKey,
        organizationId: getOrganizationId(),
        activationId: activation.id,
      });
    } catch (error) {
      if (!isPolarNotFound(error)) {
        throw error;
      }
    }
    await markActivationDeactivatedByToken(activation.id);
  }

  // Also clear DB rows that drifted from Polar (e.g. activation removed in the Polar dashboard).
  const em = getEm();
  const license = await em.findOne(License, { licenseKey: input.licenseKey });
  if (license) {
    const stale = await em.find(Activation, {
      license: license.id,
      deviceId: input.device.device_id,
      status: "active",
    });
    const now = new Date();
    for (const activation of stale) {
      activation.status = "inactive";
      activation.deactivatedAt = now;
      activation.lastValidatedAt = now;
    }
    await em.flush();
  }
}

/**
 * Enforces seat limits using **active** `Activation` rows in our DB vs Polar’s current
 * `limitActivations` (via validate). Seat *usage* is always counted from the DB, not Polar’s
 * `usage` field.
 */
async function assertActivationCapacity(input: ActivateInput, limitActivations: number | null) {
  const em = getEm();
  const license = await em.findOne(License, { licenseKey: input.licenseKey });
  const activeInDb = license
    ? await em.count(Activation, { license: license.id, status: "active" })
    : 0;

  const seatsLimit = limitActivations ?? 0;

  if (seatsLimit > 0 && activeInDb >= seatsLimit) {
    throw forbidden(
      "LICENSE_ACTIVATION_LIMIT_REACHED",
      "This license is already active on the maximum number of devices.",
    );
  }
}

async function activateOnPolar(input: ActivateInput, polar: PolarClient) {
  return polar.licenseKeys.activate({
    key: input.licenseKey,
    organizationId: getOrganizationId(),
    label: buildActivationLabel(input.device),
    conditions: buildActivationConditions(input.device),
    meta: buildActivationMeta(input.device),
  });
}

function getPlanNameFromBenefitDescription(description: string) {
  return description.replace("License Key", "").trim();
}

async function upsertLicenseFromActivation(input: {
  product: string;
  licenseKey: string;
  planName: string;
  activation: ActivationResult;
}) {
  const em = getEm();
  const now = new Date();
  const seatsFromPolar = input.activation.licenseKey.limitActivations ?? 0;
  let license = await em.findOne(License, { licenseKey: input.licenseKey });

  if (!license) {
    license = em.create(License, {
      id: createId(),
      product: input.product,
      licenseKey: input.licenseKey,
      planName: input.planName,
      customerEmail: input.activation.licenseKey.customer.email,
      instanceName: null,
      seatsAllowed: seatsFromPolar,
      expiresAt: input.activation.licenseKey.expiresAt,
      status: "active",
      notes: null,
      createdAt: now,
      updatedAt: now,
    });
    em.persist(license);
  } else {
    license.product = input.product;
    license.planName = input.planName;
    license.customerEmail = input.activation.licenseKey.customer.email;
    license.seatsAllowed = seatsFromPolar;
    license.expiresAt = input.activation.licenseKey.expiresAt;
    // Polar just accepted the activation, so a previously revoked key was re-granted.
    license.status = "active";
    license.updatedAt = now;
  }

  await em.flush();
  return license;
}

async function upsertDeviceActivation(input: {
  license: License;
  device: DeviceInput;
  activationToken: string;
}) {
  const em = getEm();
  const now = new Date();
  let activation = await em.findOne(Activation, {
    license: input.license.id,
    deviceId: input.device.device_id,
  });

  if (activation) {
    activation.activationToken = input.activationToken;
    activation.deviceName = input.device.device_name;
    activation.platform = input.device.platform;
    activation.arch = input.device.arch;
    activation.status = "active";
    activation.activatedAt = now;
    activation.lastValidatedAt = now;
    activation.deactivatedAt = null;
  } else {
    activation = em.create(Activation, {
      id: createId(),
      license: input.license,
      activationToken: input.activationToken,
      deviceId: input.device.device_id,
      deviceName: input.device.device_name,
      platform: input.device.platform,
      arch: input.device.arch,
      status: "active",
      activatedAt: now,
      lastValidatedAt: now,
      deactivatedAt: null,
    });
    em.persist(activation);
  }

  await em.flush();
}

async function markActivationDeactivatedByToken(activationToken: string) {
  const em = getEm();
  const stored = await em.findOne(Activation, { activationToken });
  if (!stored) {
    return;
  }

  const now = new Date();
  stored.status = "inactive";
  stored.deactivatedAt = now;
  stored.lastValidatedAt = now;
  await em.flush();
}

async function touchActivationValidated(activationToken: string) {
  const em = getEm();
  const stored = await em.findOne(Activation, { activationToken, status: "active" });
  if (!stored) {
    return;
  }

  stored.lastValidatedAt = new Date();
  await em.flush();
}

/**
 * Mirrors a Polar revocation (refund, subscription revoked, manual revoke) into our DB:
 * the license is marked revoked and its activations stop counting as used seats.
 * Polar itself rejects the key afterwards, so the app sees `revoked` on its next validate.
 */
export async function revokeLocalLicenseForPolarKey(licenseKeyId: string) {
  const polar = getPolarClient();
  const key = await polar.licenseKeys.get({ id: licenseKeyId });
  const em = getEm();
  const license = await em.findOne(License, { licenseKey: key.key });
  if (!license) {
    // Never activated through this backend; nothing to mirror.
    return { licenseFound: false, activationsDeactivated: 0 };
  }

  const now = new Date();
  license.status = "revoked";
  license.updatedAt = now;

  const activations = await em.find(Activation, { license: license.id, status: "active" });
  for (const activation of activations) {
    activation.status = "inactive";
    activation.deactivatedAt = now;
    activation.lastValidatedAt = now;
  }

  await em.flush();
  return { licenseFound: true, activationsDeactivated: activations.length };
}

export async function activatePolarLicenseKey(payload: unknown) {
  const input = activateSchema.parse(payload);
  const polar = getPolarClient();

  const validated = await polar.licenseKeys.validate({
    key: input.licenseKey,
    organizationId: getOrganizationId(),
    conditions: buildActivationConditions(input.device),
  });
  assertLicenseUsable(validated);

  await releaseDeviceActivations(input, validated.id, polar);
  await assertActivationCapacity(input, validated.limitActivations);
  const activation = await activateOnPolar(input, polar);
  const benefit = await polar.benefits.get({ id: activation.licenseKey.benefitId });

  const planName = getPlanNameFromBenefitDescription(benefit.description);
  const license = await upsertLicenseFromActivation({
    product: input.product,
    licenseKey: input.licenseKey,
    planName,
    activation,
  });
  await upsertDeviceActivation({
    license,
    device: input.device,
    activationToken: activation.id,
  });
  const devicesUsed = (await countActiveDevicesForLicenseKey(input.licenseKey)) ?? 0;

  return mapActivationResponse(input.product, input.licenseKey, planName, activation, devicesUsed);
}

export async function validatePolarLicenseKey(payload: unknown) {
  const input = validateSchema.parse(payload);
  const polar = getPolarClient();

  let validated: ValidatedLicenseKey;
  try {
    validated = await polar.licenseKeys.validate({
      key: input.licenseKey,
      organizationId: getOrganizationId(),
      activationId: input.activationToken,
      conditions: buildActivationConditions(input.device),
    });
  } catch (error) {
    if (!isPolarNotFound(error)) {
      throw error;
    }
    // The key or this activation no longer exists on Polar (deactivated elsewhere,
    // released by a re-activation of this device, or deleted). Tell the app it is no
    // longer licensed instead of failing the refresh.
    await markActivationDeactivatedByToken(input.activationToken);
    return {
      status: "inactive" as const,
      licenseKey: input.licenseKey,
      activationToken: null,
      product: input.product,
      message: STATUS_MESSAGES.inactive,
      source: "polar",
    };
  }

  const license = await getEm().findOne(License, { licenseKey: input.licenseKey });
  const response = mapValidatedResponse(
    input.product,
    input.licenseKey,
    license?.planName ?? "Polar License",
    validated,
    await countActiveDevicesForLicenseKey(input.licenseKey),
  );

  if (response.status === "active") {
    await touchActivationValidated(input.activationToken);
  }

  return response;
}

export async function deactivatePolarLicenseKey(payload: unknown) {
  const input = deactivateSchema.parse(payload);
  if (!input.activationToken) {
    throw badRequest("ACTIVATION_NOT_FOUND");
  }
  if (!input.licenseKey) {
    throw badRequest("LICENSE_KEY_REQUIRED");
  }
  const licenseKey = input.licenseKey;

  const polar = getPolarClient();
  await polar.licenseKeys.deactivate({
    key: licenseKey,
    organizationId: getOrganizationId(),
    activationId: input.activationToken,
  });

  await markActivationDeactivatedByToken(input.activationToken);

  return {
    status: "inactive",
    licenseKey,
    activationToken: input.activationToken,
    product: input.product,
    message: "License deactivated",
    source: "polar",
  };
}
