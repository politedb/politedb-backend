import { MikroORM } from "@mikro-orm/postgresql";
import { Client } from "pg";
import { afterAll, describe, expect, it } from "vitest";
import { entities } from "../src/db/entities";
import { ormConfig } from "../src/db/orm";

// Needs a disposable Postgres server, e.g.
//   docker run --rm -p 55432:5432 -e POSTGRES_PASSWORD=test postgres:16
//   TEST_POSTGRES_URL=postgresql://postgres:test@localhost:55432/postgres npm test
const adminUrl = process.env.TEST_POSTGRES_URL;

async function freshDatabase(name: string) {
  const client = new Client({ connectionString: adminUrl });
  await client.connect();
  await client.query(`drop database if exists "${name}"`);
  await client.query(`create database "${name}"`);
  await client.end();
  const url = new URL(adminUrl!);
  url.pathname = `/${name}`;
  return url.toString();
}

const opened: MikroORM[] = [];
afterAll(async () => {
  await Promise.all(opened.map((orm) => orm.close(true)));
});

async function open(url: string) {
  const orm = await MikroORM.init(ormConfig(url));
  opened.push(orm);
  return orm;
}

describe.skipIf(!adminUrl)("migrations (Postgres)", () => {
  it("creates the full schema on an empty database", async () => {
    const orm = await open(await freshDatabase("politedb_mig_fresh"));

    await orm.getMigrator().up();

    expect((await orm.getMigrator().getExecutedMigrations()).map((m) => m.name)).toEqual([
      "Migration20261015000000Initial",
    ]);
    expect((await orm.schema.getUpdateSchemaSQL({ wrap: false })).trim()).toBe("");
  });

  it("baselines a database created by the old updateSchema() boot", async () => {
    const url = await freshDatabase("politedb_mig_baseline");
    const legacy = await MikroORM.init({ entities, clientUrl: url });
    await legacy.schema.updateSchema();
    await legacy.em.getConnection().execute(
      `insert into licenses (id, product, license_key, plan_name, customer_email, seats_allowed, status, created_at, updated_at)
       values ('lic_1', 'politedb', 'KEY-1', 'Ultimate', 'a@b.c', 1, 'active', now(), now())`,
    );
    await legacy.close(true);

    const orm = await open(url);
    await orm.getMigrator().up();

    expect(await orm.getMigrator().getPendingMigrations()).toEqual([]);
    expect((await orm.schema.getUpdateSchemaSQL({ wrap: false })).trim()).toBe("");
    const [{ count }] = await orm.em.getConnection().execute(`select count(*)::int as count from licenses`);
    expect(count).toBe(1);
  });
});
