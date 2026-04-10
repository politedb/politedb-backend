# PoliteDB Backend

`PoliteDB Backend` is an Express + TypeScript backend for managing product licenses and device activations. It provides APIs to create licenses, activate them on specific devices, validate activation tokens, deactivate devices, and revoke licenses.

## Tech Stack

- Express 5
- TypeScript
- SQLite
- `better-sqlite3`
- Zod

## Features

- Create and manage license keys
- Activate a license for a specific device
- Validate activation tokens
- Deactivate a device from a license
- Revoke a license and invalidate all active devices
- Store data locally in SQLite

## Getting Started

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment variables

```bash
cp .env.example .env
```

For local email testing, the default SMTP values in `.env.example` are set up for Mailpit.

Start Mailpit with Docker Compose:

```bash
docker compose up -d
```

Mailpit services:

- SMTP server: `localhost:1025`
- Web UI: `http://localhost:8025`

### 3. Start the development server

```bash
npm run dev
```

By default, the server runs at `http://localhost:4000`.

## Environment Variables

- `PORT`: server port
- `LICENSE_API_KEY`: API key required for admin endpoints
- `DATABASE_PATH`: path to the SQLite database file
- `DEFAULT_PRODUCT`: default product name used when creating licenses
- `POLAR_ACCESS_TOKEN`: Polar organization access token
- `POLAR_WEBHOOK_SECRET`: webhook secret from the Polar dashboard
- `POLAR_SERVER`: `sandbox` or `production`
- `POLAR_PRODUCT_IDS`: comma-separated Polar product IDs used by checkout when the request does not provide `productIds`
- `POLAR_SUCCESS_URL`: default success URL for Polar checkout
- `POLAR_RETURN_URL`: optional default return URL for Polar checkout
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

#### Create a license

`POST /v1/admin/licenses`

Headers:

```txt
x-api-key: <LICENSE_API_KEY>
```

Request body:

```json
{
  "product": "politedb",
  "planName": "Pro Annual",
  "customerEmail": "owner@example.com",
  "instanceName": "Acme Team",
  "seatsAllowed": 3,
  "expiresAt": "2027-01-01T00:00:00.000Z"
}
```

#### List licenses

`GET /v1/admin/licenses`

Returns all licenses and their current device usage.

#### Revoke a license

`POST /v1/admin/licenses/:licenseId/revoke`

Revokes the license and deactivates all active devices linked to it.

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
  "instanceName": "Acme Team",
  "seatsAllowed": 3
}
```

This endpoint creates a Polar checkout session and returns the hosted checkout URL.

### Polar webhook endpoint

`POST /polar/webhooks`

Polar sends billing events to this endpoint. The backend validates the webhook signature and then:

- creates or updates a local license when `order.paid` is received
- sends the issued license key to the buyer by email when SMTP is configured
- revokes a local license when `order.refunded` is received
- revokes a local license when `subscription.revoked` is received

License emails are sent at most once per Polar order. If Polar retries the same webhook, the backend will not resend an already delivered email.

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
- `src/services/license-service.ts`: license business logic
- `src/db/database.ts`: SQLite setup and schema initialization
- `src/utils/licenseKey.ts`: license key and token generation helpers

## Notes

- The database file is stored locally using SQLite.
- Admin endpoints are protected with the `x-api-key` header.
- The service is designed to match the current `politedb` license flow.
- Polar checkout metadata is copied into local license fields so you can keep using the existing activation API.
