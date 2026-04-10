import { z } from "zod";
import { env } from "../config/env";
import { getPolarClient } from "../libs/polar";

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

function getOrganizationId() {
  if (!env.polarOrganizationId) {
    throw new Error("POLAR_ORGANIZATION_ID is required");
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
  activation: Awaited<ReturnType<ReturnType<typeof getPolarClient>["licenseKeys"]["activate"]>>,
) {
  return {
    status: "active",
    licenseId: activation.licenseKey.id,
    licenseKey,
    activationToken: activation.id,
    planName: activation.licenseKey.customer.name ?? "Polar License",
    customerEmail: activation.licenseKey.customer.email,
    instanceName: activation.label,
    expiresAt: activation.licenseKey.expiresAt?.toISOString() ?? null,
    activatedAt: activation.createdAt.getTime(),
    lastValidatedAt: activation.modifiedAt?.getTime() ?? activation.createdAt.getTime(),
    seatsAllowed: activation.licenseKey.limitActivations ?? null,
    devicesUsed: null,
    product,
    message: "License activated",
    source: "polar",
  };
}

function mapValidatedResponse(
  product: string,
  licenseKey: string,
  validated: Awaited<ReturnType<ReturnType<typeof getPolarClient>["licenseKeys"]["validate"]>>,
) {
  return {
    status: validated.activation ? "active" : "inactive",
    licenseId: validated.id,
    licenseKey,
    activationToken: validated.activation?.id ?? null,
    planName: validated.customer.name ?? "Polar License",
    customerEmail: validated.customer.email,
    instanceName: validated.activation?.label ?? null,
    expiresAt: validated.expiresAt?.toISOString() ?? null,
    activatedAt: validated.activation?.createdAt.getTime() ?? null,
    lastValidatedAt: validated.lastValidatedAt?.getTime() ?? null,
    seatsAllowed: validated.limitActivations,
    devicesUsed: null,
    product,
    message: "License valid",
    source: "polar",
  };
}

async function resolveLicenseKeyForDeactivation(activationToken?: string, licenseKey?: string) {
  if (licenseKey && activationToken) {
    return licenseKey;
  }

  if (!activationToken) {
    throw new Error("ACTIVATION_NOT_FOUND");
  }

  if (!licenseKey) {
    throw new Error("LICENSE_KEY_REQUIRED");
  }

  return licenseKey;
}

export async function activatePolarLicenseKey(payload: unknown) {
  const input = activateSchema.parse(payload);
  const polar = getPolarClient();
  const activation = await polar.licenseKeys.activate({
    key: input.licenseKey,
    organizationId: getOrganizationId(),
    label: buildActivationLabel(input.device),
    conditions: buildActivationConditions(input.device),
    meta: buildActivationMeta(input.device),
  });

  return mapActivationResponse(input.product, input.licenseKey, activation);
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

  return mapValidatedResponse(input.product, input.licenseKey, validated);
}

export async function deactivatePolarLicenseKey(payload: unknown) {
  const input = deactivateSchema.parse(payload);
  const licenseKey = await resolveLicenseKeyForDeactivation(
    input.activationToken,
    input.licenseKey,
  );

  if (!input.activationToken) {
    throw new Error("ACTIVATION_NOT_FOUND");
  }

  const polar = getPolarClient();
  await polar.licenseKeys.deactivate({
    key: licenseKey,
    organizationId: getOrganizationId(),
    activationId: input.activationToken,
  });

  return {
    status: "inactive",
    licenseKey,
    activationToken: input.activationToken,
    product: input.product,
    message: "License deactivated",
    source: "polar",
  };
}

