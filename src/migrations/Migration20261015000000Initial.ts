import { Migration } from "@mikro-orm/migrations";

/**
 * Baseline schema, identical to what `updateSchema()` produced from the entities before
 * migrations were introduced. Databases created that way already have these tables, so
 * the migration only records itself as applied there.
 */
export class Migration20261015000000Initial extends Migration {
  override async up(): Promise<void> {
    const [{ exists }] = await this.execute(
      `select to_regclass('public.licenses') is not null as "exists"`,
    );
    if (exists) {
      return;
    }

    this.addSql(
      `create table "licenses" ("id" varchar(255) not null, "product" varchar(255) not null, "license_key" varchar(255) not null, "plan_name" varchar(255) not null, "customer_email" varchar(255) not null, "instance_name" varchar(255) null, "seats_allowed" int not null default 1, "expires_at" timestamptz null, "status" varchar(255) not null default 'active', "notes" varchar(255) null, "created_at" timestamptz not null, "updated_at" timestamptz not null, constraint "licenses_pkey" primary key ("id"));`,
    );
    this.addSql(
      `alter table "licenses" add constraint "licenses_license_key_unique" unique ("license_key");`,
    );

    this.addSql(
      `create table "activations" ("id" varchar(255) not null, "license_id" varchar(255) not null, "activation_token" varchar(255) not null, "device_id" varchar(255) not null, "device_name" varchar(255) not null, "platform" varchar(255) not null, "arch" varchar(255) not null, "status" varchar(255) not null default 'active', "activated_at" timestamptz not null, "last_validated_at" timestamptz not null, "deactivated_at" timestamptz null, constraint "activations_pkey" primary key ("id"));`,
    );
    this.addSql(
      `alter table "activations" add constraint "activations_activation_token_unique" unique ("activation_token");`,
    );
    this.addSql(`create index "idx_activations_token" on "activations" ("activation_token");`);
    this.addSql(
      `alter table "activations" add constraint "idx_activations_license_device" unique ("license_id", "device_id");`,
    );

    this.addSql(
      `create table "polar_license_key_deliveries" ("grant_id" varchar(255) not null, "polar_order_id" varchar(255) null, "polar_benefit_id" varchar(255) null, "polar_license_key_id" varchar(255) null, "customer_email" varchar(255) not null, "email_sent_at" timestamptz null, "email_error" varchar(255) null, "created_at" timestamptz not null, "updated_at" timestamptz not null, constraint "polar_license_key_deliveries_pkey" primary key ("grant_id"));`,
    );
    this.addSql(
      `create index "idx_polar_license_key_deliveries_order" on "polar_license_key_deliveries" ("polar_order_id");`,
    );

    this.addSql(
      `create table "polar_transactions" ("id" varchar(255) not null, "polar_order_id" varchar(255) not null, "polar_checkout_id" varchar(255) null, "polar_subscription_id" varchar(255) null, "polar_customer_id" varchar(255) not null, "polar_product_id" varchar(255) null, "external_customer_id" varchar(255) null, "license_id" varchar(255) not null, "event_type" varchar(255) not null, "status" varchar(255) not null default 'paid', "license_email_sent_at" timestamptz null, "license_email_error" varchar(255) null, "metadata_json" text null, "created_at" timestamptz not null, "updated_at" timestamptz not null, constraint "polar_transactions_pkey" primary key ("id"));`,
    );
    this.addSql(
      `alter table "polar_transactions" add constraint "polar_transactions_polar_order_id_unique" unique ("polar_order_id");`,
    );
    this.addSql(
      `create index "idx_polar_transactions_subscription" on "polar_transactions" ("polar_subscription_id");`,
    );
    this.addSql(
      `create index "idx_polar_transactions_license" on "polar_transactions" ("license_id");`,
    );

    this.addSql(
      `alter table "activations" add constraint "activations_license_id_foreign" foreign key ("license_id") references "licenses" ("id") on update cascade on delete cascade;`,
    );
    this.addSql(
      `alter table "polar_transactions" add constraint "polar_transactions_license_id_foreign" foreign key ("license_id") references "licenses" ("id") on update cascade on delete cascade;`,
    );
  }
}
