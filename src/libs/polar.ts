import { Polar } from "@polar-sh/sdk";
import { env } from "../config/env";

function assertPolarConfigured() {
  console.log(env.polarAccessToken);
  if (!env.polarAccessToken) {
    throw new Error("POLAR_ACCESS_TOKEN is required");
  }
}

export function getPolarClient() {
  assertPolarConfigured();
  return new Polar({
    accessToken: env.polarAccessToken,
    server: env.polarServer,
  });
}
