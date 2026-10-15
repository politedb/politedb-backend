import { Activation, License } from "../db/entities";
import { getEm } from "../db/orm";

function now() {
  return new Date();
}

function toLicenseResponse(license: License, devicesUsed?: number) {
  return {
    licenseId: license.id,
    product: license.product,
    licenseKey: license.licenseKey,
    planName: license.planName,
    customerEmail: license.customerEmail,
    instanceName: license.instanceName,
    seatsAllowed: license.seatsAllowed,
    devicesUsed: devicesUsed ?? 0,
    expiresAt: license.expiresAt?.toISOString() ?? null,
    status: license.status,
    notes: license.notes,
    createdAt: license.createdAt.getTime(),
    updatedAt: license.updatedAt.getTime(),
  };
}

async function countActiveDevices(licenseId: string) {
  const em = getEm();
  return em.count(Activation, { license: licenseId, status: "active" });
}

export async function listLicenses() {
  const em = getEm();
  const licenses = await em.find(License, {}, { orderBy: { createdAt: "DESC" } });

  return Promise.all(
    licenses.map(async (license: License) =>
      toLicenseResponse(license, await countActiveDevices(license.id)),
    ),
  );
}

export async function revokeLicense(licenseId: string) {
  const em = getEm();
  const license = await em.findOne(License, { id: licenseId });

  if (!license) {
    throw new Error("LICENSE_NOT_FOUND");
  }

  license.status = "revoked";
  license.updatedAt = now();

  const activations = await em.find(Activation, { license: licenseId, status: "active" });
  const deactivatedAt = now();

  for (const activation of activations) {
    activation.status = "inactive";
    activation.deactivatedAt = deactivatedAt;
    activation.lastValidatedAt = deactivatedAt;
  }

  await em.flush();

  return {
    licenseId,
    status: "revoked",
  };
}
