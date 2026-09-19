import { describe, expect, test } from "bun:test"
import { AppConfig } from "@lister/config"
import { Effect } from "effect"
import { Database } from "./Database.ts"
import { exchangeTable } from "./schema.ts"

const databaseUrl = process.env.DATABASE_URL

describe("Database", () => {
  test.skipIf(!databaseUrl)("builds against the configured Postgres and applies migrations", async () => {
    const program = Effect.gen(function*() {
      const database = yield* Database

      return yield* database.db.select().from(exchangeTable).limit(1)
    })

    const rows = await Effect.runPromise(
      program.pipe(Effect.provide(Database.layer()), Effect.provide(AppConfig.layer), Effect.scoped)
    )

    expect(rows).toBeArray()
  })
})
