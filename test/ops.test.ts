import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPolarMock, setupTestOrm } from "./helpers";

const polar = createPolarMock();
vi.mock("../src/libs/polar", () => ({ getPolarClient: () => polar }));

import { app } from "../src/app";

let orm: Awaited<ReturnType<typeof setupTestOrm>>;

beforeEach(async () => {
  orm = await setupTestOrm();
  polar.checkouts.create.mockResolvedValue({
    id: "co_1",
    url: "https://polar.sh/checkout/co_1",
    clientSecret: "secret",
    expiresAt: new Date("2026-12-01T00:00:00Z"),
    status: "open",
  });
});

afterEach(async () => {
  await orm.close(true);
});

describe("health", () => {
  it("reports the database as up", async () => {
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: "ok", checks: { database: "up" } });
  });

  it("returns 503 when the database is unreachable", async () => {
    vi.spyOn(orm.em.getConnection(), "execute").mockRejectedValueOnce(new Error("db down"));
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ status: "error", checks: { database: "down" } });
  });
});

describe("CORS", () => {
  it("allows the landing page origin", async () => {
    const res = await request(app).get("/api/health").set("Origin", "https://politedb.com");
    expect(res.headers["access-control-allow-origin"]).toBe("https://politedb.com");
  });

  it("does not allow other origins", async () => {
    const res = await request(app).get("/api/health").set("Origin", "https://evil.example");
    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });
});

describe("rate limiting", () => {
  it("limits checkout creation per client and never answers 404", async () => {
    const body = { productIds: ["prod_allowed"] };
    const statuses: number[] = [];
    for (let i = 0; i < 11; i += 1) {
      statuses.push((await request(app).post("/api/v1/polar/checkout").send(body)).status);
    }

    expect(statuses.slice(0, 10).every((status) => status === 201)).toBe(true);
    const limited = await request(app).post("/api/v1/polar/checkout").send(body);
    expect(limited.status).toBe(429);
    expect(limited.body.error).toBe("RATE_LIMITED");
  });

  it("does not rate limit Polar webhooks", async () => {
    // Webhooks are verified by signature; a burst of retries must not be throttled.
    const statuses: number[] = [];
    for (let i = 0; i < 70; i += 1) {
      statuses.push((await request(app).post("/api/v1/polar/webhooks").send("{}")).status);
    }
    expect(statuses).not.toContain(429);
  });
});
