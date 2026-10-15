import { Migration20261015000000Initial } from "./Migration20261015000000Initial";

/**
 * Applied in order at startup. Listed explicitly (no filesystem glob) so the same list
 * works from `src` (tsx, tests) and `dist`.
 *
 * To add a migration: change the entities, run `npm run db:diff` against a database at the
 * current schema, put the printed SQL in a new `MigrationYYYYMMDDHHMMSS<Name>.ts`, and
 * append it here.
 */
export const migrationsList = [
  { name: "Migration20261015000000Initial", class: Migration20261015000000Initial },
];
