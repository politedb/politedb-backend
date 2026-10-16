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

const INITIAL = "Migration20261015000000Initial";
const DROP_TRANSACTIONS = "Migration20261015010000DropPolarTransactions";

async function tableExists(orm: MikroORM, table: string) {
  const [{ exists }] = await orm.em
    .getConnection()
    .execute(`select to_regclass('public.${table}') is not null as "exists"`);
  return exists as boolean;
}

/** A database as the old `updateSchema()` boot left it: tables, no migrations table. */
async function legacyDatabase(name: string) {
  const url = await freshDatabase(name);
  const orm = await MikroORM.init(ormConfig(url));
  await orm.migrator.up({ to: INITIAL });
  await orm.em.getConnection().execute(`drop table mikro_orm_migrations`);
  await orm.close(true);
  return url;
}

describe.skipIf(!adminUrl)("migrations (Postgres)", () => {
  it("creates the full schema on an empty database", async () => {
    const orm = await open(await freshDatabase("politedb_mig_fresh"));

    await orm.migrator.up();

    expect((await orm.migrator.getExecuted()).map((m) => m.name)).toEqual([
      INITIAL,
      DROP_TRANSACTIONS,
      "Migration20261015020000AddEmailClaim",
    ]);
    expect((await orm.schema.getUpdateSchemaSQL({ wrap: false })).trim()).toBe("");
    expect(await tableExists(orm, "polar_transactions")).toBe(false);
  });

  it("baselines a database created by the old updateSchema() boot", async () => {
    const url = await legacyDatabase("politedb_mig_baseline");
    const seed = await MikroORM.init({ entities, clientUrl: url });
    await seed.em.getConnection().execute(
      `insert into licenses (id, product, license_key, plan_name, customer_email, seats_allowed, status, created_at, updated_at)
       values ('lic_1', 'politedb', 'KEY-1', 'Ultimate', 'a@b.c', 1, 'active', now(), now())`,
    );
    await seed.close(true);

    const orm = await open(url);
    await orm.migrator.up();

    expect(await orm.migrator.getPending()).toEqual([]);
    expect((await orm.schema.getUpdateSchemaSQL({ wrap: false })).trim()).toBe("");
    const [{ count }] = await orm.em.getConnection().execute(`select count(*)::int as count from licenses`);
    expect(count).toBe(1);
  });

  it("refuses to drop polar_transactions when it holds rows", async () => {
    const orm = await open(await legacyDatabase("politedb_mig_nonempty"));
    await orm.em.getConnection().execute(
      `insert into licenses (id, product, license_key, plan_name, customer_email, seats_allowed, status, created_at, updated_at)
       values ('lic_1', 'politedb', 'KEY-1', 'Ultimate', 'a@b.c', 1, 'active', now(), now());
       insert into polar_transactions (id, polar_order_id, polar_customer_id, license_id, event_type, status, created_at, updated_at)
       values ('tx_1', 'order_1', 'cus_1', 'lic_1', 'order.paid', 'paid', now(), now());`,
    );

    await expect(orm.migrator.up()).rejects.toThrow(/polar_transactions has 1 row/);
    expect(await tableExists(orm, "polar_transactions")).toBe(true);
  });
});
