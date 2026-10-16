import { MikroORM } from "@mikro-orm/sqlite";
import { PolarError } from "@polar-sh/sdk/models/errors/polarerror.js";
import { vi } from "vitest";
import { entities } from "../src/db/entities";
import { setOrmForTesting } from "../src/db/orm";

/** Fresh in-memory database per test, using the production entity schemas. */
export async function setupTestOrm() {
  const orm = await MikroORM.init({ entities, dbName: ":memory:", allowGlobalContext: true });
  await orm.schema.create();
  setOrmForTesting(orm);
  return orm;
}

export function polarError(status: number) {
  const response = new Response("{}", { status });
  return new PolarError(`Polar ${status}`, { response, request: new Request("https://polar.test"), body: "{}" });
}

export function polarNotFound() {
  return polarError(404);
}

export const device = {
  device_id: "device-a",
  device_name: "Tony's Mac",
  platform: "macos",
  arch: "aarch64",
};

export function licenseKeyFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: "lk_1",
    key: "POLAR-KEY-1",
    benefitId: "ben_1",
    status: "granted",
    expiresAt: null,
    limitActivations: 2,
    lastValidatedAt: null,
    customer: { email: "buyer@example.com" },
    activations: [],
    ...overrides,
  };
}

export function activationFixture(id: string, deviceId: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    label: "Mac",
    meta: { device_id: deviceId },
    createdAt: new Date("2026-01-01T00:00:00Z"),
    modifiedAt: null,
    licenseKey: licenseKeyFixture(),
    ...overrides,
  };
}

export function createPolarMock() {
  return {
    licenseKeys: {
      validate: vi.fn(),
      get: vi.fn(),
      activate: vi.fn(),
      deactivate: vi.fn(),
    },
    benefits: { get: vi.fn().mockResolvedValue({ description: "Ultimate License Key" }) },
    checkouts: { create: vi.fn() },
  };
}
