import { defineConfig } from "drizzle-kit";
import { databaseUrl } from "./src/config";


export default defineConfig({
  schema: "./packages/db/src/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: databaseUrl(),
  },
});
