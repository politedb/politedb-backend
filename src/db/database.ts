import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { env } from "../config/env";

fs.mkdirSync(path.dirname(env.databasePath), { recursive: true });

export const db = new Database(env.databasePath);
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS licenses (
    id TEXT PRIMARY KEY,
    product TEXT NOT NULL,
    license_key TEXT NOT NULL UNIQUE,
    plan_name TEXT NOT NULL,
    customer_email TEXT NOT NULL,
    instance_name TEXT,
    seats_allowed INTEGER NOT NULL DEFAULT 1,
    expires_at TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    notes TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS activations (
    id TEXT PRIMARY KEY,
    license_id TEXT NOT NULL,
    activation_token TEXT NOT NULL UNIQUE,
    device_id TEXT NOT NULL,
    device_name TEXT NOT NULL,
    platform TEXT NOT NULL,
    arch TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    activated_at INTEGER NOT NULL,
    last_validated_at INTEGER NOT NULL,
    deactivated_at INTEGER,
    FOREIGN KEY (license_id) REFERENCES licenses (id)
  );

  CREATE UNIQUE INDEX IF NOT EXISTS idx_activations_license_device
  ON activations (license_id, device_id);

  CREATE INDEX IF NOT EXISTS idx_activations_token
  ON activations (activation_token);

  CREATE TABLE IF NOT EXISTS polar_transactions (
    id TEXT PRIMARY KEY,
    polar_order_id TEXT NOT NULL UNIQUE,
    polar_checkout_id TEXT,
    polar_subscription_id TEXT,
    polar_customer_id TEXT NOT NULL,
    polar_product_id TEXT,
    external_customer_id TEXT,
    license_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'paid',
    license_email_sent_at INTEGER,
    license_email_error TEXT,
    metadata_json TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (license_id) REFERENCES licenses (id)
  );

  CREATE INDEX IF NOT EXISTS idx_polar_transactions_subscription
  ON polar_transactions (polar_subscription_id);

  CREATE INDEX IF NOT EXISTS idx_polar_transactions_license
  ON polar_transactions (license_id);

  CREATE TABLE IF NOT EXISTS polar_license_key_deliveries (
    grant_id TEXT PRIMARY KEY,
    polar_order_id TEXT,
    polar_benefit_id TEXT,
    polar_license_key_id TEXT,
    customer_email TEXT NOT NULL,
    email_sent_at INTEGER,
    email_error TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_polar_license_key_deliveries_order
  ON polar_license_key_deliveries (polar_order_id);
`);

const polarTransactionColumns = db
  .prepare("PRAGMA table_info(polar_transactions)")
  .all() as Array<{ name: string }>;

if (!polarTransactionColumns.some((column) => column.name === "license_email_sent_at")) {
  db.exec("ALTER TABLE polar_transactions ADD COLUMN license_email_sent_at INTEGER");
}

if (!polarTransactionColumns.some((column) => column.name === "license_email_error")) {
  db.exec("ALTER TABLE polar_transactions ADD COLUMN license_email_error TEXT");
}
