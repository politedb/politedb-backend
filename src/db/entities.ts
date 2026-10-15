import { Collection, EntitySchema } from "@mikro-orm/core";

export class License {
  id!: string;
  product!: string;
  licenseKey!: string;
  planName!: string;
  customerEmail!: string;
  instanceName!: string | null;
  seatsAllowed!: number;
  expiresAt!: Date | null;
  status!: string;
  notes!: string | null;
  createdAt!: Date;
  updatedAt!: Date;
  activations = new Collection<Activation>(this);
}

export class Activation {
  id!: string;
  license!: License;
  activationToken!: string;
  deviceId!: string;
  deviceName!: string;
  platform!: string;
  arch!: string;
  status!: string;
  activatedAt!: Date;
  lastValidatedAt!: Date;
  deactivatedAt!: Date | null;
}

export class PolarLicenseDelivery {
  grantId!: string;
  polarOrderId!: string | null;
  polarBenefitId!: string | null;
  polarLicenseKeyId!: string | null;
  customerEmail!: string;
  emailSentAt!: Date | null;
  emailClaimedAt!: Date | null;
  emailError!: string | null;
  createdAt!: Date;
  updatedAt!: Date;
}

export const LicenseSchema = new EntitySchema<License>({
  class: License,
  tableName: "licenses",
  properties: {
    id: { type: "string", primary: true },
    product: { type: "string" },
    licenseKey: { type: "string", unique: true, fieldName: "license_key" },
    planName: { type: "string", fieldName: "plan_name" },
    customerEmail: { type: "string", fieldName: "customer_email" },
    instanceName: { type: "string", nullable: true, fieldName: "instance_name" },
    seatsAllowed: { type: "number", fieldName: "seats_allowed", default: 1 },
    expiresAt: { type: "datetime", nullable: true, fieldName: "expires_at" },
    status: { type: "string", default: "active" },
    notes: { type: "string", nullable: true },
    createdAt: { type: "datetime", fieldName: "created_at" },
    updatedAt: { type: "datetime", fieldName: "updated_at" },
    activations: {
      kind: "1:m",
      entity: () => Activation,
      mappedBy: "license",
    },
  },
});

export const ActivationSchema = new EntitySchema<Activation>({
  class: Activation,
  tableName: "activations",
  indexes: [{ properties: ["activationToken"], name: "idx_activations_token" }],
  uniques: [{ properties: ["license", "deviceId"], name: "idx_activations_license_device" }],
  properties: {
    id: { type: "string", primary: true },
    license: {
      kind: "m:1",
      entity: () => License,
      fieldName: "license_id",
      deleteRule: "cascade",
    },
    activationToken: { type: "string", unique: true, fieldName: "activation_token" },
    deviceId: { type: "string", fieldName: "device_id" },
    deviceName: { type: "string", fieldName: "device_name" },
    platform: { type: "string" },
    arch: { type: "string" },
    status: { type: "string", default: "active" },
    activatedAt: { type: "datetime", fieldName: "activated_at" },
    lastValidatedAt: { type: "datetime", fieldName: "last_validated_at" },
    deactivatedAt: { type: "datetime", nullable: true, fieldName: "deactivated_at" },
  },
});

export const PolarLicenseDeliverySchema = new EntitySchema<PolarLicenseDelivery>({
  class: PolarLicenseDelivery,
  tableName: "polar_license_key_deliveries",
  indexes: [{ properties: ["polarOrderId"], name: "idx_polar_license_key_deliveries_order" }],
  properties: {
    grantId: { type: "string", primary: true, fieldName: "grant_id" },
    polarOrderId: { type: "string", nullable: true, fieldName: "polar_order_id" },
    polarBenefitId: { type: "string", nullable: true, fieldName: "polar_benefit_id" },
    polarLicenseKeyId: { type: "string", nullable: true, fieldName: "polar_license_key_id" },
    customerEmail: { type: "string", fieldName: "customer_email" },
    emailSentAt: { type: "datetime", nullable: true, fieldName: "email_sent_at" },
    // Set while one request is sending the email, so concurrent webhook deliveries
    // for the same grant do not send it twice.
    emailClaimedAt: { type: "datetime", nullable: true, fieldName: "email_claimed_at" },
    emailError: { type: "string", nullable: true, fieldName: "email_error" },
    createdAt: { type: "datetime", fieldName: "created_at" },
    updatedAt: { type: "datetime", fieldName: "updated_at" },
  },
});

export const entities = [
  LicenseSchema,
  ActivationSchema,
  PolarLicenseDeliverySchema,
];
