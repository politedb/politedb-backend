import { Migrator } from "@mikro-orm/migrations";
import { MikroORM, type Options } from "@mikro-orm/postgresql";
import { env } from "../config/env";
import { migrationsList } from "../migrations";
import { entities } from "./entities";

let orm: MikroORM | null = null;

function getClientUrl() {
  if (!env.databaseUrl) {
    throw new Error("DATABASE_URL is required");
  }

  return env.databaseUrl;
}

export function ormConfig(clientUrl: string): Options {
  return {
    entities,
    clientUrl,
    extensions: [Migrator],
    migrations: {
      migrationsList,
      // Each migration runs in a transaction; a failure leaves the schema unchanged.
      transactional: true,
      allOrNothing: true,
      // Snapshots are only for `migration:create`; never write files at runtime.
      snapshot: false,
    },
  };
}

export async function initOrm() {
  if (!orm) {
    orm = await MikroORM.init(ormConfig(getClientUrl()));

    // Explicit migrations instead of `updateSchema()`, which could alter or drop columns
    // on every boot based on entity definitions.
    await orm.migrator.up();
  }

  return orm;
}

/** Tests only: inject an ORM (e.g. in-memory SQLite) instead of connecting to Postgres. */
export function setOrmForTesting(instance: unknown) {
  orm = instance as MikroORM;
}

export function getOrm() {
  if (!orm) {
    throw new Error("ORM_NOT_INITIALIZED");
  }

  return orm;
}

export function getEm() {
  return getOrm().em.fork();
}
