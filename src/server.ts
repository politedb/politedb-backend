import { initErrorReporting, flushErrorReporting, reportError } from "./instrument";
initErrorReporting();

import { app } from "./app";
import { env } from "./config/env";
import { getOrm, initOrm } from "./db/orm";
import { rateLimitEnabled } from "./middleware/rate-limit";

const SHUTDOWN_TIMEOUT_MS = 10_000;

async function bootstrap() {
  await initOrm();

  if (!rateLimitEnabled) {
    console.warn(
      "Rate limiting is disabled: on Render, TRUST_PROXY must be the measured proxy hop count (see GET /api/v1/admin/debug/client-ip).",
    );
  }

  const server = app.listen(env.port, () => {
    console.log(`Server is listening on port ${env.port}`);
  });

  let shuttingDown = false;
  const shutdown = (signal: string) => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    console.log(`${signal} received, shutting down`);

    // Stop accepting connections, let in-flight requests finish, then release the DB pool.
    const forceExit = setTimeout(() => {
      console.error("Shutdown timed out, exiting");
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);
    forceExit.unref();

    server.close(async () => {
      try {
        await getOrm().close();
        await flushErrorReporting();
      } finally {
        process.exit(0);
      }
    });
    server.closeIdleConnections();
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled promise rejection", reason);
  reportError(reason);
});

bootstrap().catch(async (error) => {
  console.error("Failed to start server", error);
  reportError(error);
  await flushErrorReporting();
  process.exit(1);
});
