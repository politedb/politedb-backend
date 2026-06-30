import { z } from 'zod';
import { env } from '../config/env';
import { Activation, License } from '../db/entities';
import { getEm } from '../db/orm';
import { getPolarClient } from '../libs/polar';
import { createId } from '../utils/license-key';

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
    message: 'activationToken or licenseKey is required',
    path: ['activationToken'],
  });

type DeviceInput = z.infer<typeof deviceSchema>;
type ActivateInput = z.infer<typeof activateSchema>;
type ActivationResult = Awaited<
  ReturnType<ReturnType<typeof getPolarClient>['licenseKeys']['activate']>
>;

function getOrganizationId() {
  if (!env.polarOrganizationId) {
    throw new Error('POLAR_ORGANIZATION_ID is required');
  }

  return env.polarOrganizationId;
}

function buildActivationLabel(device: z.infer<typeof deviceSchema>) {
  return `${device.device_name} (${device.platform}/${device.arch})`;
}

function buildActivationMeta(device: z.infer<typeof deviceSchema>) {
  return {
    device_id: device.device_id,
    device_name: device.device_name,
    platform: device.platform,
    arch: device.arch,
  };
}

function buildActivationConditions(device: z.infer<typeof deviceSchema>) {
  return {
    device_id: device.device_id,
    platform: device.platform,
    arch: device.arch,
  };
}

function mapActivationResponse(
  product: string,
  licenseKey: string,
  planName: string,
  activation: Awaited<ReturnType<ReturnType<typeof getPolarClient>['licenseKeys']['activate']>>,
  devicesUsed: number,
) {
  return {
    status: 'active',
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
    message: 'License activated',
    source: 'polar',
  };
}

function mapValidatedResponse(
  product: string,
  licenseKey: string,
  planName: string,
  validated: Awaited<ReturnType<ReturnType<typeof getPolarClient>['licenseKeys']['validate']>>,
  devicesUsed: number | null,
) {
  return {
    status: validated.activation ? 'active' : 'inactive',
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
    message: 'License valid',
    source: 'polar',
  };
}

async function countActiveDevicesForLicenseKey(licenseKey: string) {
  const em = getEm();
  const license = await em.findOne(License, { licenseKey });
  if (!license) {
    return null;
  }

  return em.count(Activation, { license: license.id, status: 'active' });
}

async function resolveLicenseKeyForDeactivation(activationToken?: string, licenseKey?: string) {
  if (licenseKey && activationToken) {
    return licenseKey;
  }

  if (!activationToken) {
    throw new Error('ACTIVATION_NOT_FOUND');
  }

  if (!licenseKey) {
    throw new Error('LICENSE_KEY_REQUIRED');
  }

  return licenseKey;
}

/**
 * Enforces seat limits using **active** `Activation` rows in our DB vs Polar’s current
 * `limitActivations` (via validate). Seat *usage* is always counted from the DB, not Polar’s
 * `usage` field.
 */
async function assertActivationCapacity(
  input: ActivateInput,
  polar: ReturnType<typeof getPolarClient>,
) {
  const em = getEm();
  const license = await em.findOne(License, { licenseKey: input.licenseKey });

  if (license) {
    const sameDeviceActive = await em.findOne(Activation, {
      license: license.id,
      deviceId: input.device.device_id,
      status: 'active',
    });
    if (sameDeviceActive) {
      throw new Error('DEVICE_ALREADY_ACTIVATED');
    }
  }

  const activeInDb = license
    ? await em.count(Activation, { license: license.id, status: 'active' })
    : 0;

  const validated = await polar.licenseKeys.validate({
    key: input.licenseKey,
    organizationId: getOrganizationId(),
    conditions: buildActivationConditions(input.device),
  });

  const seatsLimit = validated.limitActivations ?? 0;

  if (seatsLimit > 0 && activeInDb >= seatsLimit) {
    throw new Error('LICENSE_ACTIVATION_LIMIT_REACHED');
  }
}

async function activateOnPolar(input: ActivateInput, polar: ReturnType<typeof getPolarClient>) {
  return polar.licenseKeys.activate({
    key: input.licenseKey,
    organizationId: getOrganizationId(),
    label: buildActivationLabel(input.device),
    conditions: buildActivationConditions(input.device),
    meta: buildActivationMeta(input.device),
  });
}

function getPlanNameFromBenefitDescription(description: string) {
  return description.replace('License Key', '').trim();
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
      status: 'active',
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
    activation.status = 'active';
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
      status: 'active',
      activatedAt: now,
      lastValidatedAt: now,
      deactivatedAt: null,
    });
    em.persist(activation);
  }

  await em.flush();
}

async function countActiveDevices(licenseId: string) {
  return getEm().count(Activation, { license: licenseId, status: 'active' });
}

async function markActivationDeactivatedByToken(activationToken: string) {
  const em = getEm();
  const stored = await em.findOne(Activation, { activationToken });
  if (!stored) {
    return;
  }

  const now = new Date();
  stored.status = 'inactive';
  stored.deactivatedAt = now;
  stored.lastValidatedAt = now;
  await em.flush();
}

export async function activatePolarLicenseKey(payload: unknown) {
  const input = activateSchema.parse(payload);
  const polar = getPolarClient();

  await assertActivationCapacity(input, polar);
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
  const devicesUsed = await countActiveDevices(license.id);

  return mapActivationResponse(input.product, input.licenseKey, planName, activation, devicesUsed);
}

export async function validatePolarLicenseKey(payload: unknown) {
  const input = validateSchema.parse(payload);
  const polar = getPolarClient();

  const validated = await polar.licenseKeys.validate({
    key: input.licenseKey,
    organizationId: getOrganizationId(),
    activationId: input.activationToken,
    conditions: buildActivationConditions(input.device),
  });

  const license = await getEm().findOne(License, { licenseKey: input.licenseKey });
  const devicesUsed = await countActiveDevicesForLicenseKey(input.licenseKey);

  return mapValidatedResponse(
    input.product,
    input.licenseKey,
    license?.planName ?? 'Polar License',
    validated,
    devicesUsed,
  );
}

export async function deactivatePolarLicenseKey(payload: unknown) {
  const input = deactivateSchema.parse(payload);
  const licenseKey = await resolveLicenseKeyForDeactivation(
    input.activationToken,
    input.licenseKey,
  );

  if (!input.activationToken) {
    throw new Error('ACTIVATION_NOT_FOUND');
  }

  const polar = getPolarClient();
  await polar.licenseKeys.deactivate({
    key: licenseKey,
    organizationId: getOrganizationId(),
    activationId: input.activationToken,
  });

  await markActivationDeactivatedByToken(input.activationToken);

  return {
    status: 'inactive',
    licenseKey,
    activationToken: input.activationToken,
    product: input.product,
    message: 'License deactivated',
    source: 'polar',
  };
}
