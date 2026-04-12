import { app } from "./app";
import { env } from "./config/env";
import { initOrm } from "./db/orm";

async function bootstrap() {
  await initOrm();

  app.listen(env.port, () => {
    console.log(`Server is listening on port ${env.port}`);
  });
}

bootstrap().catch((error) => {
  console.error("Failed to start server", error);
  process.exit(1);
});
