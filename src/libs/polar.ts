import { Polar } from "@polar-sh/sdk";
import { env } from "../config/env";

function assertPolarConfigured() {
  if (!env.polarAccessToken) {
    throw new Error("POLAR_ACCESS_TOKEN is required");
  }

  if (!env.polarOrganizationId) {
    throw new Error("POLAR_ORGANIZATION_ID is required");
  }
}

export function getPolarClient() {
  assertPolarConfigured();
  return new Polar({
    accessToken: env.polarAccessToken,
    server: env.polarServer,
  });
}
