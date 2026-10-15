import { Migration } from "@mikro-orm/migrations";

/** Lock column so concurrent webhook deliveries send a license email only once. */
export class Migration20261015020000AddEmailClaim extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table "polar_license_key_deliveries" add column "email_claimed_at" timestamptz null;`,
    );
  }
}
