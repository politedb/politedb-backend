import { Router } from "express";
import { getOrm } from "../db/orm";

export const healthRouter = Router();

// Used by the deploy script and uptime checks: fails when the database is unreachable.
healthRouter.get("/", async (_req, res) => {
  let database: "up" | "down" = "up";
  try {
    await getOrm().em.getConnection().execute("select 1");
  } catch {
    database = "down";
  }

  res.status(database === "up" ? 200 : 503).json({
    status: database === "up" ? "ok" : "error",
    service: "politedb",
    checks: { database },
    timestamp: new Date().toISOString(),
  });
});
