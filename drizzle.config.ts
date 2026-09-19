import { defineConfig } from "drizzle-kit";

// Legacy boundary note: this config reads the connection URL directly instead
// of the `AppConfig` service because drizzle-kit tooling runs outside the
// Effect runtime. Keep the default in sync with `localDatabaseUrl` in
// `packages/config/src/AppConfig.ts`.
const databaseUrl = (): string => process.env.DATABASE_URL?.trim() ||
  "postgres://orchestra:change-me-local@localhost:5432/orchestra";

export default defineConfig({
  schema: "./packages/db/src/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: databaseUrl(),
  },
});
