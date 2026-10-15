/**
 * Prints the SQL needed to bring DATABASE_URL in line with the current entities, without
 * changing anything. Use it to write a new migration (see src/migrations/index.ts), or to
 * confirm production matches the entities (empty output).
 *
 *   npm run db:diff
 */
import { MikroORM } from "@mikro-orm/postgresql";
import { env } from "../src/config/env";
import { ormConfig } from "../src/db/orm";

async function main() {
  if (!env.databaseUrl) {
    throw new Error("DATABASE_URL is required");
  }
  const orm = await MikroORM.init(ormConfig(env.databaseUrl));
  try {
    const sql = await orm.schema.getUpdateSchemaSQL({ wrap: false });
    console.log(sql.trim() || "-- schema matches entities");
  } finally {
    await orm.close(true);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
