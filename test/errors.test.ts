import { ConnectionError } from "@polar-sh/sdk/models/errors/httpclienterrors.js";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPolarMock, device, polarError, setupTestOrm } from "./helpers";

const polar = createPolarMock();
vi.mock("../src/libs/polar", () => ({ getPolarClient: () => polar }));

import { app, mapPolarError } from "../src/app";

let orm: Awaited<ReturnType<typeof setupTestOrm>>;

beforeEach(async () => {
  vi.clearAllMocks();
  orm = await setupTestOrm();
});

afterEach(async () => {
  await orm.close(true);
});

const validateBody = {
  product: "politedb",
  licenseKey: "POLAR-KEY-1",
  activationToken: "not-a-uuid",
  device,
};

describe("Polar error mapping over HTTP", () => {
  it.each([
    [422, 400, "INVALID_LICENSE_REQUEST"],
    [400, 400, "INVALID_LICENSE_REQUEST"],
    [403, 403, "LICENSE_NOT_PERMITTED"],
    [401, 503, "UPSTREAM_ERROR"],
    [429, 503, "UPSTREAM_ERROR"],
    [500, 503, "UPSTREAM_ERROR"],
  ])("Polar %i on validate -> %i %s", async (polarStatus, status, code) => {
    polar.licenseKeys.validate.mockRejectedValue(polarError(polarStatus));

    const res = await request(app).post("/api/v1/validate").send(validateBody);

    expect(res.status).toBe(status);
    expect(res.body.error).toBe(code);
    expect(res.headers["content-type"]).toContain("application/json");
  });

  it("maps a network failure reaching Polar to 503", async () => {
    polar.licenseKeys.validate.mockRejectedValue(new ConnectionError("connect ETIMEDOUT"));

    const res = await request(app).post("/api/v1/validate").send(validateBody);

    expect(res.status).toBe(503);
    expect(res.body.error).toBe("UPSTREAM_ERROR");
  });
});

describe("mapPolarError", () => {
  it("never returns 404 or 502", () => {
    for (let status = 400; status < 600; status += 1) {
      expect([404, 502]).not.toContain(mapPolarError(status).status);
    }
  });
});
