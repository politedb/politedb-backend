import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    // Set before src/config/env.ts loads; dotenv does not override existing variables.
    env: {
      LICENSE_API_KEY: "test-admin-key",
      POLAR_ACCESS_TOKEN: "test-token",
      POLAR_ORGANIZATION_ID: "org_test",
      POLAR_WEBHOOK_SECRET: "test-webhook-secret",
      POLAR_PRODUCT_IDS: "prod_allowed",
      POLAR_SUCCESS_URL: "https://politedb.com/pricing?checkout=success",
      POLAR_RETURN_URL: "https://politedb.com/pricing?checkout=cancelled",
      CHECKOUT_ALLOWED_ORIGINS: "",
      SMTP_HOST: "smtp.test",
      SMTP_FROM: "PoliteDB <licenses@test>",
    },
  },
});
