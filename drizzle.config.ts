import { defineConfig } from "drizzle-kit";

// Legacy boundary note: this config reads the connection URL directly instead
// of the `AppConfig` service because drizzle-kit tooling runs outside the
// Effect runtime. Keep the default in sync with `localDatabaseUrl` in
// `packages/config/src/AppConfig.ts`.
const databaseUrl = (): string => process.env.DATABASE_URL?.trim() ||
  "postgres://abogoboga:abogoboga@localhost:5432/abogoboga";

export default defineConfig({
  schema: "./packages/db/src/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: databaseUrl(),
  },
});
