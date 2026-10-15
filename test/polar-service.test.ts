import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPolarMock, setupTestOrm } from "./helpers";

const polar = createPolarMock();
vi.mock("../src/libs/polar", () => ({ getPolarClient: () => polar }));

const sendLicenseIssuedEmail = vi.fn();
vi.mock("../src/services/email-service", () => ({
  canSendLicenseEmails: () => true,
  sendLicenseIssuedEmail: (...args: unknown[]) => sendLicenseIssuedEmail(...args),
}));

import { app } from "../src/app";
import { Activation, License, PolarLicenseDelivery } from "../src/db/entities";
import { getEm } from "../src/db/orm";
import { processPolarEvent } from "../src/services/polar-service";

let orm: Awaited<ReturnType<typeof setupTestOrm>>;

beforeEach(async () => {
  vi.clearAllMocks();
  orm = await setupTestOrm();
  polar.checkouts.create.mockResolvedValue({
    id: "co_1",
    url: "https://polar.sh/checkout/co_1",
    clientSecret: "secret",
    expiresAt: new Date("2026-12-01T00:00:00Z"),
    status: "open",
  });
  polar.licenseKeys.get.mockResolvedValue({
    key: "POLAR-KEY-1",
    benefitId: "ben_1",
    limitActivations: 2,
    expiresAt: null,
  });
  polar.benefits.get.mockResolvedValue({ description: "Ultimate License Key" });
});

afterEach(async () => {
  await orm.close(true);
});

describe("POST /api/v1/polar/checkout", () => {
  const landingBody = {
    productIds: ["prod_allowed"],
    licenseProduct: "politedb",
    planName: "Ultimate",
    successUrl: "https://politedb.com/pricing?checkout=success&plan=ultimate",
    returnUrl: "https://politedb.com/pricing?checkout=cancelled&plan=ultimate",
  };

  it("accepts the landing page request", async () => {
    const res = await request(app).post("/api/v1/polar/checkout").send(landingBody);

    expect(res.status).toBe(201);
    expect(res.body.url).toBe("https://polar.sh/checkout/co_1");
  });

  it("rejects products not configured on the server", async () => {
    const res = await request(app)
      .post("/api/v1/polar/checkout")
      .send({ ...landingBody, productIds: ["prod_hidden"] });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("PRODUCT_NOT_ALLOWED");
    expect(polar.checkouts.create).not.toHaveBeenCalled();
  });

  it.each(["successUrl", "returnUrl"])("rejects a foreign %s", async (field) => {
    const res = await request(app)
      .post("/api/v1/polar/checkout")
      .send({ ...landingBody, [field]: "https://evil.example/phish" });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("REDIRECT_NOT_ALLOWED");
  });

  it("never forwards a client-supplied customerId", async () => {
    await request(app)
      .post("/api/v1/polar/checkout")
      .send({ ...landingBody, customerId: "cus_someone_else" });

    expect(polar.checkouts.create.mock.calls[0][0]).not.toHaveProperty("customerId");
  });
});

function grantEvent(type: string, licenseKeyId?: string) {
  return {
    type,
    data: {
      id: "grant_1",
      orderId: "order_1",
      benefitId: "ben_1",
      customerId: "cus_1",
      customer: { email: "buyer@example.com", name: "Buyer" },
      benefit: { type: "license_keys", description: "Ultimate License Key" },
      properties: licenseKeyId ? { licenseKeyId } : {},
    },
  } as unknown as Parameters<typeof processPolarEvent>[0];
}

describe("license email webhook", () => {
  it("sends the email once per grant", async () => {
    const first = await processPolarEvent(grantEvent("benefit_grant.created", "lk_1"));
    const second = await processPolarEvent(grantEvent("benefit_grant.created", "lk_1"));

    expect(first).toMatchObject({ licenseEmail: { status: "sent" } });
    expect(second).toMatchObject({ licenseEmail: { status: "skipped", reason: "ALREADY_SENT" } });
    expect(sendLicenseIssuedEmail).toHaveBeenCalledTimes(1);
    expect(sendLicenseIssuedEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "buyer@example.com", planName: "Ultimate", licenseKey: "POLAR-KEY-1" }),
    );
  });

  it("waits for the key, then sends on benefit_grant.updated", async () => {
    const created = await processPolarEvent(grantEvent("benefit_grant.created"));
    const updated = await processPolarEvent(grantEvent("benefit_grant.updated", "lk_1"));

    expect(created).toMatchObject({ licenseEmail: { reason: "LICENSE_KEY_NOT_READY" } });
    expect(updated).toMatchObject({ licenseEmail: { status: "sent" } });
  });

  it("fails with 503 so Polar retries, and records the error", async () => {
    sendLicenseIssuedEmail.mockRejectedValueOnce(new Error("SMTP down"));

    await expect(processPolarEvent(grantEvent("benefit_grant.created", "lk_1"))).rejects.toMatchObject({
      status: 503,
      code: "LICENSE_EMAIL_FAILED",
    });

    const delivery = await getEm().findOneOrFail(PolarLicenseDelivery, { grantId: "grant_1" });
    expect(delivery.emailSentAt).toBeNull();
    expect(delivery.emailError).toBe("SMTP down");

    // The retried webhook succeeds.
    await expect(processPolarEvent(grantEvent("benefit_grant.created", "lk_1"))).resolves.toMatchObject({
      licenseEmail: { status: "sent" },
    });
  });
});

describe("concurrent webhook deliveries", () => {
  it("send the license email only once", async () => {
    let release!: () => void;
    sendLicenseIssuedEmail.mockImplementationOnce(() => new Promise<void>((resolve) => (release = resolve)));

    const first = processPolarEvent(grantEvent("benefit_grant.created", "lk_1"));
    // Let the first delivery claim the grant and start sending.
    await vi.waitFor(() => expect(sendLicenseIssuedEmail).toHaveBeenCalledTimes(1));
    const second = await processPolarEvent(grantEvent("benefit_grant.updated", "lk_1"));
    release();

    expect(await first).toMatchObject({ licenseEmail: { status: "sent" } });
    expect(second).toMatchObject({ licenseEmail: { status: "skipped" } });
    expect(sendLicenseIssuedEmail).toHaveBeenCalledTimes(1);
  });
});

describe("admin API", () => {
  const adminKey = "test-admin-key";

  it("rejects a missing or wrong key", async () => {
    expect((await request(app).get("/api/v1/admin/licenses")).status).toBe(401);
    expect((await request(app).get("/api/v1/admin/licenses").set("x-api-key", "wrong")).status).toBe(401);
  });

  it("accepts the configured key", async () => {
    const res = await request(app).get("/api/v1/admin/licenses").set("x-api-key", adminKey);
    expect(res.status).toBe(200);
  });

  it("lists failed emails and resends them", async () => {
    sendLicenseIssuedEmail.mockRejectedValueOnce(new Error("SMTP down"));
    await processPolarEvent(grantEvent("benefit_grant.created", "lk_1")).catch(() => undefined);

    const failed = await request(app).get("/api/v1/admin/license-emails/failed").set("x-api-key", adminKey);
    expect(failed.body.items).toEqual([expect.objectContaining({ grantId: "grant_1", emailError: "SMTP down" })]);

    const resent = await request(app)
      .post("/api/v1/admin/license-emails/grant_1/resend")
      .set("x-api-key", adminKey);
    expect(resent.status).toBe(200);
    expect(resent.body).toEqual({ status: "sent" });

    const after = await request(app).get("/api/v1/admin/license-emails/failed").set("x-api-key", adminKey);
    expect(after.body.items).toEqual([]);
  });

  it("can resend an email that was already delivered", async () => {
    await processPolarEvent(grantEvent("benefit_grant.created", "lk_1"));

    const resent = await request(app)
      .post("/api/v1/admin/license-emails/grant_1/resend")
      .set("x-api-key", adminKey);

    expect(resent.body).toEqual({ status: "sent" });
    expect(sendLicenseIssuedEmail).toHaveBeenCalledTimes(2);
  });

  it("returns 400, not 404, for an unknown grant", async () => {
    const res = await request(app)
      .post("/api/v1/admin/license-emails/nope/resend")
      .set("x-api-key", adminKey);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("DELIVERY_NOT_FOUND");
  });
});

describe("error handler", () => {
  it("does not leak internal error messages", async () => {
    polar.checkouts.create.mockRejectedValueOnce(new Error("connect ECONNREFUSED 10.0.0.5:5432"));
    const res = await request(app)
      .post("/api/v1/polar/checkout")
      .send({ productIds: ["prod_allowed"] });

    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toContain("10.0.0.5");
  });
});

describe("benefit_grant.revoked", () => {
  async function seedActiveLicense() {
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
    for (const [id, deviceId] of [
      ["act_a", "device-a"],
      ["act_b", "device-b"],
    ]) {
      em.create(Activation, {
        id: `row_${id}`,
        license,
        activationToken: id,
        deviceId,
        deviceName: "Mac",
        platform: "macos",
        arch: "aarch64",
        status: "active",
        activatedAt: now,
        lastValidatedAt: now,
        deactivatedAt: null,
      });
    }
    await em.flush();
  }

  it("marks the license revoked and frees its seats", async () => {
    await seedActiveLicense();

    const result = await processPolarEvent(grantEvent("benefit_grant.revoked", "lk_1"));

    expect(result).toMatchObject({ result: { licenseFound: true, activationsDeactivated: 2 } });
    const em = getEm();
    expect((await em.findOneOrFail(License, { id: "lic_1" })).status).toBe("revoked");
    expect(await em.count(Activation, { status: "active" })).toBe(0);
  });

  it("is a no-op for a key never activated here", async () => {
    const result = await processPolarEvent(grantEvent("benefit_grant.revoked", "lk_1"));
    expect(result).toMatchObject({ result: { licenseFound: false } });
  });

  it("ignores non-license benefits", async () => {
    const event = grantEvent("benefit_grant.revoked", "lk_1") as any;
    event.data.benefit.type = "discord";

    expect(await processPolarEvent(event)).toMatchObject({ ignored: true });
    expect(polar.licenseKeys.get).not.toHaveBeenCalled();
  });
});
