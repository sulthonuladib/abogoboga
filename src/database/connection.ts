import { drizzle } from "drizzle-orm/bun-sql";
import { databaseUrl } from "../config";
import { dbRelations } from "./relations";

// Legacy adapter boundary: importing this module performs no I/O and reads no
// environment. The throwing `databaseUrl()` helper is evaluated only when a
// connection is first requested, keeping import-time side effects out of the
// module graph. New code should use the `Database` service in `packages/db`
// instead of these getters.

let cachedConnection: Bun.SQL | undefined;

let cachedDatabase: DB | undefined;

/**
 * Get (creating on first use) the shared `Bun.SQL` client.
 *
 * @returns The shared Postgres client.
 */
export function getPostgresConnection(): Bun.SQL {
  cachedConnection ??= new Bun.SQL(databaseUrl());

  return cachedConnection;
}

function createDatabase() {
  return drizzle({
    client: getPostgresConnection(),
    relations: dbRelations,
  });
}

/**
 * Get (creating on first use) the Drizzle database handle.
 *
 * @returns The shared Drizzle handle over the lazy Postgres client.
 */
export function getDatabase(): DB {
  cachedDatabase ??= createDatabase();

  return cachedDatabase;
}

/**
 * Shared Drizzle handle type.
 */
export type DB = ReturnType<typeof createDatabase>;
