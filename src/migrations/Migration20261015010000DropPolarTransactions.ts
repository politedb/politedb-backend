import { Migration } from "@mikro-orm/migrations";

/**
 * `polar_transactions` was never written by any code path. Drop it, but refuse if it
 * unexpectedly holds rows so no data is lost silently.
 */
export class Migration20261015010000DropPolarTransactions extends Migration {
  override async up(): Promise<void> {
    const [{ exists }] = await this.execute(
      `select to_regclass('public.polar_transactions') is not null as "exists"`,
    );
    if (!exists) {
      return;
    }

    const [{ count }] = await this.execute(`select count(*)::int as "count" from "polar_transactions"`);
    if (count > 0) {
      throw new Error(
        `polar_transactions has ${count} row(s); back them up and empty the table before this migration`,
      );
    }

    this.addSql(`drop table "polar_transactions";`);
  }
}
