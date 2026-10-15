# PoliteDB Backend

`PoliteDB Backend` is an Express + TypeScript backend for Polar-powered license key checkout, activation, validation, and delivery backed by PostgreSQL 16 via MikroORM.

## Tech Stack

- Express 5
- TypeScript
- PostgreSQL 16
- MikroORM
- Zod

## Features

- Create Polar checkout sessions
- Activate a license for a specific device
- Validate activation tokens
- Deactivate a device from a license
- Deliver Polar license keys by email
- Store activations, license state and webhook delivery state in PostgreSQL

## Getting Started

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment variables

```bash
cp .env.example .env
```

For local development, `.env.example` is set up for PostgreSQL on `localhost:5432` and Mailpit on `localhost:1025`.

Start PostgreSQL and Mailpit with Docker Compose:

```bash
docker compose up -d
```

- PostgreSQL: `localhost:5432`
- SMTP server: `localhost:1025`
- Web UI: `http://localhost:8025`

### 3. Start the development server

```bash
npm run dev
```

By default, the server runs at `http://localhost:4000`.

## Environment Variables

- `PORT`: server port
- `LICENSE_API_KEY`: API key required for admin endpoints. Required; the server refuses to start if it is empty or `change-me`
- `DATABASE_URL`: PostgreSQL connection string used by MikroORM
- `POLAR_ACCESS_TOKEN`: Polar organization access token
- `POLAR_ORGANIZATION_ID`: Polar organization ID used for license key activation and validation
- `POLAR_WEBHOOK_SECRET`: webhook secret from the Polar dashboard
- `POLAR_SERVER`: `sandbox` or `production`
- `POLAR_PRODUCT_IDS`: comma-separated Polar product IDs that can be sold through checkout. Used as the default when the request does not provide `productIds`; requested `productIds` must be in this list
- `POLAR_SUCCESS_URL`: default success URL for Polar checkout
- `POLAR_RETURN_URL`: optional default return URL for Polar checkout
- `CHECKOUT_ALLOWED_ORIGINS`: optional comma-separated extra browser origins allowed for CORS and for client-supplied `successUrl`/`returnUrl`. The origins of `POLAR_SUCCESS_URL` and `POLAR_RETURN_URL` are always allowed
- `TRUST_PROXY`: Express `trust proxy` setting. Default `loopback` (reverse proxy on the same host). Use a hop count (e.g. `1`) or proxy IPs/CIDRs for other setups; never `true` on a public port, since clients could spoof their IP
- `SENTRY_DSN`: optional; enables error reporting for 5xx and upstream errors. Request bodies, headers, cookies and query strings are never sent
- `SENTRY_ENVIRONMENT`: Sentry environment name, defaults to `NODE_ENV`
- `SMTP_HOST`: SMTP server hostname for license delivery emails
- `SMTP_PORT`: SMTP server port, usually `587` or `465`
- `SMTP_SECURE`: set to `true` for implicit TLS, otherwise `false`
- `SMTP_USER`: optional SMTP username
- `SMTP_PASS`: optional SMTP password
- `SMTP_FROM`: sender email address used for license delivery

## Available Scripts

### Run in development mode

```bash
npm run dev
```

### Build the project

```bash
npm run build
```

### Run the production build

```bash
npm start
```

## API Endpoints

### Health Check

`GET /health`

Returns the current service status.

### Admin Endpoints

#### List licenses

`GET /v1/admin/licenses`

Returns licenses recorded locally when they were activated, with their active device counts.

#### Revoke a license

`POST /v1/admin/licenses/:licenseId/revoke`

Marks a license revoked in the local database and deactivates its stored activations. It does not revoke the key on Polar.

#### List failed license emails

`GET /v1/admin/license-emails/failed`

Lists Polar license deliveries whose last email attempt failed and that have not been sent since.

#### Resend a license email

`POST /v1/admin/license-emails/:grantId/resend`

Sends the license email for a Polar benefit grant again, e.g. after Polar stopped retrying the webhook.

### Client Endpoints

#### Activate a license

`POST /v1/activate`

```json
{
  "product": "politedb",
  "licenseKey": "POLI-1234-5678-9ABC-DEF0",
  "device": {
    "device_id": "device-001",
    "device_name": "Lam Tung MacBook",
    "platform": "macos",
    "arch": "arm64"
  }
}
```

#### Validate an activation

`POST /v1/validate`

```json
{
  "product": "politedb",
  "licenseKey": "POLI-1234-5678-9ABC-DEF0",
  "activationToken": "<token>",
  "device": {
    "device_id": "device-001",
    "device_name": "Lam Tung MacBook",
    "platform": "macos",
    "arch": "arm64"
  }
}
```

#### Deactivate a device

`POST /v1/deactivate`

```json
{
  "product": "politedb",
  "licenseKey": "POLI-1234-5678-9ABC-DEF0",
  "activationToken": "<token>",
  "device": {
    "device_id": "device-001",
    "device_name": "Lam Tung MacBook",
    "platform": "macos",
    "arch": "arm64"
  }
}
```

### Create a Polar checkout session

`POST /v1/polar/checkout`

```json
{
  "productIds": ["<polar-product-id>"],
  "customerEmail": "owner@example.com",
  "customerName": "Acme Team",
  "externalCustomerId": "team_123",
  "licenseProduct": "politedb",
  "planName": "Pro Annual",
  "seatsAllowed": 3
}
```

This endpoint creates a Polar checkout session and returns the hosted checkout URL.

It is public, so it only accepts `productIds` listed in `POLAR_PRODUCT_IDS` and `successUrl`/`returnUrl` on an allowed origin (see `CHECKOUT_ALLOWED_ORIGINS`). A client-supplied `customerId` is ignored.

### Polar webhook endpoint

`POST /polar/webhooks`

Polar sends billing events to this endpoint. In the Polar License Keys flow, the backend validates the webhook signature and then:

- marks the local license revoked when a `license_keys` benefit grant is revoked (`benefit_grant.revoked`, which Polar also sends for refunds and revoked subscriptions)
- sends the issued Polar license key by email when `benefit_grant.created` or `benefit_grant.updated` is received for a `license_keys` benefit (the key may only exist on the update)

License emails are sent at most once per Polar benefit grant. If Polar retries the same webhook, the backend will not resend an already delivered email. If sending fails, the webhook responds `503` so Polar retries it; use the admin resend endpoint once Polar stops retrying.

## License behavior notes

- Activating a license on a device that already holds an activation (for example after a reinstall or a lost activation token) releases the old activation for that `device_id` instead of failing.
- `validate` reports `revoked`, `disabled` or `expired` from the Polar key status, and `inactive` (with a `200` response) when the activation no longer exists on Polar.
- Business errors never use HTTP `404`, because the desktop app treats `404` as a missing endpoint and tries another URL.

## Suggested Frontend Configuration

If you want to connect this service to the existing frontend, use:

```bash
VITE_LICENSE_API_BASE=http://localhost:4000/v1
VITE_LICENSE_PRODUCT=politedb
```

## Project Structure

- `src/server.ts`: server entry point
- `src/app.ts`: Express app configuration and error handling
- `src/routes`: HTTP route definitions
- `src/services/license-service.ts`: admin license listing and revocation
- `src/services/polar-license-key.ts`: activation, validation and deactivation against Polar
- `src/services/polar-service.ts`: checkout, webhooks and license emails
- `src/db/orm.ts`: MikroORM bootstrap; applies pending migrations on startup
- `src/migrations`: schema migrations, listed in `src/migrations/index.ts`
- `src/db/entities.ts`: MikroORM entity schemas

## Operations

- `GET /api/health` returns `200` with `checks.database: "up"`, or `503` when the database is unreachable.
- Per-IP rate limits (in memory, per instance): license endpoints 60/min, checkout 10/min, admin 30/min. Exceeding them returns `429 RATE_LIMITED`. Polar webhooks are not rate limited.
- On Render (`RENDER=true`), rate limiting stays **disabled until `TRUST_PROXY` is set**, because without it every request appears to come from Render's proxy and all users would share one limit. A warning is logged at startup.
- CORS only allows the configured browser origins (see `CHECKOUT_ALLOWED_ORIGINS`). The desktop app and Polar webhooks are unaffected by CORS.
- On `SIGTERM`/`SIGINT` the server stops accepting connections, lets in-flight requests finish (up to 10 s, within Render's shutdown grace period), then closes the database pool.
- Logs include `rid=` from the `x-request-id` header when a proxy sets it.

## Render

Production runs on Render. Recommended service settings:

- Build command: `npm ci --include=dev && npm run build` (TypeScript is a dev dependency)
- Start command: `node dist/server.js`
- Health check path: `/api/health` (Render only switches traffic to a new deploy once it passes)
- Auto-Deploy: **Off**. `.github/workflows/deploy-render.yml` runs the build and the full test suite (including migration tests on Postgres) on every pull request and push to `main`; on `main`, once tests pass, it calls the Render deploy hook with `ref=<commit sha>` so exactly the tested commit is deployed
- Deploy hook: copy it from the service's Settings tab into the `RENDER_DEPLOY_HOOK_URL` repository secret. It contains a secret key; use "Regenerate Hook" on Render if it leaks
- `TRUST_PROXY`: Render's proxies append to `X-Forwarded-For`, and the hop count is not documented. To measure it, call `GET /api/v1/admin/debug/client-ip` (admin key) from a known public IP, once plain and once with a fake `X-Forwarded-For: 203.0.113.7` header. Increase `TRUST_PROXY` from `1` until `ip` equals your real IP in **both** calls. The fake value must never appear as `ip`.

Render sends `SIGTERM` on deploys and restarts; the server drains in-flight requests before exiting.

## Database Migrations

The schema is managed by MikroORM migrations, applied automatically on startup (each in a transaction). The server no longer calls `updateSchema()`.

- The initial migration is a baseline. On a database created by older versions (which used `updateSchema()`), it only records itself as applied.
- To change the schema: edit `src/db/entities.ts`, run `npm run db:diff` against a database at the current schema, put the printed SQL into a new `src/migrations/MigrationYYYYMMDDHHMMSS<Name>.ts`, and append it to `src/migrations/index.ts`.
- `npm run db:diff` against production should print `-- schema matches entities`.
- Migration tests run against a disposable Postgres when `TEST_POSTGRES_URL` is set (they are skipped otherwise):

```bash
docker run --rm -p 55432:5432 -e POSTGRES_PASSWORD=test postgres:16
TEST_POSTGRES_URL=postgresql://postgres:test@localhost:55432/postgres npm test
```

## Notes

- Admin endpoints are protected with the `x-api-key` header.
- The service is designed to match the current `politedb` license flow.
- To run fully on Polar License Keys, your organization access token should include `checkouts:write`, `license_keys:read`, and `license_keys:write`.
