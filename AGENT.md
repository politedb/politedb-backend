# AGENT.md

## Purpose

This repository is the backend for PoliteDB. It handles:

- Polar checkout creation
- Polar webhook processing
- Polar license-key delivery by email
- Legacy local license activation and validation endpoints
- AI endpoints under `/ai`

## Stack

- Node.js + Express 5
- TypeScript
- PostgreSQL 16
- MikroORM `6.6.13`
- Polar SDK
- Nodemailer

## Current Runtime Shape

- Module system: CommonJS
- Entry point: `src/server.ts`
- Build output: `dist/server.js`
- ORM bootstrap: `src/db/orm.ts`
- Entities: `src/db/entities.ts`
- Main routes: `src/routes/index.ts`

## Commands

Per workspace convention, prefix shell commands with `rtk`.

```bash
rtk npm install
rtk npm run dev
rtk npm run build
rtk npm start
rtk docker compose up -d
```

## Scripts

- `npm run dev`: `tsx watch --include 'src/**/*.ts' src/server.ts`
- `npm run build`: `tsc -p tsconfig.json && tsc-alias -p tsconfig.json`
- `npm start`: `node dist/server.js`

## Local Services

`docker-compose.yml` provides:

- PostgreSQL 16 on `localhost:5432`
- Mailpit SMTP on `localhost:1025`
- Mailpit UI on `http://localhost:8025`

Default local database URL:

```env
DATABASE_URL=postgresql://politedb:politedb@localhost:5432/politedb
```

## Important Environment Variables

Core:

- `PORT`
- `LICENSE_API_KEY`
- `DATABASE_URL`
- `DEFAULT_PRODUCT`

Polar:

- `POLAR_ACCESS_TOKEN`
- `POLAR_ORGANIZATION_ID`
- `POLAR_WEBHOOK_SECRET`
- `POLAR_SERVER`
- `POLAR_PRODUCT_IDS`
- `POLAR_SUCCESS_URL`
- `POLAR_RETURN_URL`

SMTP:

- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_SECURE`
- `SMTP_USER`
- `SMTP_PASS`
- `SMTP_FROM`

AI:

- `OPENAI_API_KEY`
- `OPENAI_BASE_URL`
- `AI_DEFAULT_PROVIDER`
- `AI_DEFAULT_FREE_MODEL`
- `AI_DEFAULT_ULTIMATE_MODEL`
- `AI_ENABLE_CACHE`
- `AI_ENABLE_SEMANTIC_CACHE`
- `AI_FREE_DAILY_REQUESTS`
- `AI_ULTIMATE_DAILY_REQUESTS`

## Routes

- `GET /health`
- `POST /v1/activate`
- `POST /v1/validate`
- `POST /v1/deactivate`
- `POST /v1/polar/checkout`
- `POST /v1/polar/webhooks`
- `GET|POST /v1/admin/...`
- `/ai`

## Database Notes

- ORM initialization runs in `initOrm()`.
- On startup, the app currently calls `orm.getSchemaGenerator().updateSchema()`.
- This means production startup can mutate schema automatically. Keep that in mind before changing entities.

## Deploy Notes

- GitHub Actions workflow: `.github/workflows/deploy-vps.yml`
- The workflow builds on GitHub, prunes dev dependencies, packages `dist`, `node_modules`, `scripts`, and deploys them to the VPS.
- Server restart is delegated to `scripts/deploy-vps.sh`.
- `scripts/deploy-vps.sh` prefers `systemd` if `SYSTEMD_SERVICE` is set, otherwise it uses PM2.

## Production Pitfalls

- Production Node must be modern. Old Node versions will fail to parse newer syntax used by MikroORM dependencies, for example `??=`.
- If PM2 starts the app with a different Node binary than your shell, verify both `node -v` and the Node used by PM2.
- Because the workflow ships prebuilt `node_modules`, the VPS runtime still must be compatible with those packages.

## Polar Notes

- Webhook endpoint is `POST /v1/polar/webhooks`.
- The webhook handler validates the Polar signature using `POLAR_WEBHOOK_SECRET`.
- License email delivery is tied to Polar events, especially `benefit_grant.created`.

## Working Rules For Future Agents

- Do not assume README is fully up to date; confirm against code first.
- Prefer `rtk rg` and `rtk rg --files` for search.
- Use `apply_patch` for file edits.
- Check `git status` before broad changes because this repo is often dirty.
