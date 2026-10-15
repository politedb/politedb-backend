import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  activationFixture,
  createPolarMock,
  device,
  licenseKeyFixture,
  polarNotFound,
  setupTestOrm,
} from "./helpers";

const polar = createPolarMock();
vi.mock("../src/libs/polar", () => ({ getPolarClient: () => polar }));

import { Activation, License } from "../src/db/entities";
import { getEm } from "../src/db/orm";
import {
  activatePolarLicenseKey,
  validatePolarLicenseKey,
} from "../src/services/polar-license-key";

let orm: Awaited<ReturnType<typeof setupTestOrm>>;

beforeEach(async () => {
  vi.clearAllMocks();
  polar.benefits.get.mockResolvedValue({ description: "Ultimate License Key" });
  orm = await setupTestOrm();
});

afterEach(async () => {
  await orm.close(true);
});

const activateBody = { product: "politedb", licenseKey: "POLAR-KEY-1", device };

async function activeRows() {
  return getEm().find(Activation, { status: "active" });
}

describe("activate", () => {
  it("activates a new device and records it", async () => {
    polar.licenseKeys.validate.mockResolvedValue(licenseKeyFixture());
    polar.licenseKeys.get.mockResolvedValue(licenseKeyFixture());
    polar.licenseKeys.activate.mockResolvedValue(activationFixture("act_new", device.device_id));

    const result = await activatePolarLicenseKey(activateBody);

    expect(result).toMatchObject({ status: "active", activationToken: "act_new", planName: "Ultimate", devicesUsed: 1 });
    expect(polar.licenseKeys.deactivate).not.toHaveBeenCalled();
    expect((await activeRows()).map((row: Activation) => row.activationToken)).toEqual(["act_new"]);
  });

  it("re-activates the same device after it lost its activation token", async () => {
    polar.licenseKeys.validate.mockResolvedValue(licenseKeyFixture());
    polar.licenseKeys.get.mockResolvedValue(licenseKeyFixture());
    polar.licenseKeys.activate.mockResolvedValueOnce(activationFixture("act_old", device.device_id));
    await activatePolarLicenseKey(activateBody);

    // Polar still lists the old activation for this device.
    polar.licenseKeys.get.mockResolvedValue(
      licenseKeyFixture({ activations: [activationFixture("act_old", device.device_id)] }),
    );
    polar.licenseKeys.activate.mockResolvedValueOnce(activationFixture("act_new", device.device_id));

    const result = await activatePolarLicenseKey(activateBody);

    expect(result).toMatchObject({ status: "active", activationToken: "act_new", devicesUsed: 1 });
    expect(polar.licenseKeys.deactivate).toHaveBeenCalledWith(
      expect.objectContaining({ activationId: "act_old", key: "POLAR-KEY-1" }),
    );
    expect((await activeRows()).map((row: Activation) => row.activationToken)).toEqual(["act_new"]);
  });

  it("does not release activations that belong to other devices", async () => {
    polar.licenseKeys.validate.mockResolvedValue(licenseKeyFixture());
    polar.licenseKeys.get.mockResolvedValue(
      licenseKeyFixture({ activations: [activationFixture("act_other", "device-b")] }),
    );
    polar.licenseKeys.activate.mockResolvedValue(activationFixture("act_new", device.device_id));

    await activatePolarLicenseKey(activateBody);

    expect(polar.licenseKeys.deactivate).not.toHaveBeenCalled();
  });

  it("tolerates an activation already gone from Polar while releasing", async () => {
    polar.licenseKeys.validate.mockResolvedValue(licenseKeyFixture());
    polar.licenseKeys.get.mockResolvedValue(
      licenseKeyFixture({ activations: [activationFixture("act_old", device.device_id)] }),
    );
    polar.licenseKeys.deactivate.mockRejectedValue(polarNotFound());
    polar.licenseKeys.activate.mockResolvedValue(activationFixture("act_new", device.device_id));

    await expect(activatePolarLicenseKey(activateBody)).resolves.toMatchObject({ status: "active" });
  });

  it("enforces the seat limit for other devices", async () => {
    polar.licenseKeys.validate.mockResolvedValue(licenseKeyFixture({ limitActivations: 1 }));
    polar.licenseKeys.get.mockResolvedValue(licenseKeyFixture());
    polar.licenseKeys.activate.mockResolvedValue(activationFixture("act_b", "device-b"));
    await activatePolarLicenseKey({ ...activateBody, device: { ...device, device_id: "device-b" } });

    await expect(activatePolarLicenseKey(activateBody)).rejects.toMatchObject({
      status: 403,
      code: "LICENSE_ACTIVATION_LIMIT_REACHED",
    });
  });

  it.each([
    [{ status: "revoked" }, "LICENSE_REVOKED"],
    [{ status: "disabled" }, "LICENSE_DISABLED"],
    [{ expiresAt: new Date("2020-01-01T00:00:00Z") }, "LICENSE_EXPIRED"],
  ])("rejects unusable keys (%o)", async (overrides, code) => {
    polar.licenseKeys.validate.mockResolvedValue(licenseKeyFixture(overrides));

    await expect(activatePolarLicenseKey(activateBody)).rejects.toMatchObject({ status: 403, code });
    expect(polar.licenseKeys.activate).not.toHaveBeenCalled();
  });
});

describe("validate", () => {
  const validateBody = { ...activateBody, activationToken: "act_1" };

  async function seedActivation() {
    const em = getEm();
    const now = new Date();
    const license = em.create(License, {
      id: "lic_1",
      product: "politedb",
      licenseKey: "POLAR-KEY-1",
      planName: "Ultimate",
      customerEmail: "buyer@example.com",
      instanceName: null,
      seatsAllowed: 2,
      expiresAt: null,
      status: "active",
      notes: null,
      createdAt: now,
      updatedAt: now,
    });
    em.create(Activation, {
      id: "row_1",
      license,
      activationToken: "act_1",
      deviceId: device.device_id,
      deviceName: device.device_name,
      platform: device.platform,
      arch: device.arch,
      status: "active",
      activatedAt: new Date("2026-01-01T00:00:00Z"),
      lastValidatedAt: new Date("2026-01-01T00:00:00Z"),
      deactivatedAt: null,
    });
    await em.flush();
  }

  it("reports active for a granted key with this activation", async () => {
    await seedActivation();
    polar.licenseKeys.validate.mockResolvedValue(
      licenseKeyFixture({ activation: activationFixture("act_1", device.device_id) }),
    );

    const result = await validatePolarLicenseKey(validateBody);

    expect(result).toMatchObject({ status: "active", planName: "Ultimate", devicesUsed: 1 });
    const row = await getEm().findOneOrFail(Activation, { activationToken: "act_1" });
    expect(row.lastValidatedAt.getTime()).toBeGreaterThan(new Date("2026-01-01T00:00:00Z").getTime());
  });

  it.each([
    [{ status: "revoked" }, "revoked"],
    [{ status: "disabled" }, "disabled"],
    [{ expiresAt: new Date("2020-01-01T00:00:00Z") }, "expired"],
  ])("does not report active for unusable keys (%o)", async (overrides, status) => {
    polar.licenseKeys.validate.mockResolvedValue(
      licenseKeyFixture({ activation: activationFixture("act_1", device.device_id), ...overrides }),
    );

    await expect(validatePolarLicenseKey(validateBody)).resolves.toMatchObject({ status });
  });

  it("reports inactive and frees the seat when the activation is gone on Polar", async () => {
    await seedActivation();
    polar.licenseKeys.validate.mockRejectedValue(polarNotFound());

    await expect(validatePolarLicenseKey(validateBody)).resolves.toMatchObject({ status: "inactive" });
    expect(await activeRows()).toHaveLength(0);
  });

  it("propagates other Polar errors", async () => {
    polar.licenseKeys.validate.mockRejectedValue(new Error("network down"));

    await expect(validatePolarLicenseKey(validateBody)).rejects.toThrow("network down");
  });
});
