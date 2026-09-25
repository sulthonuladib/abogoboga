import { describe, expect, test } from "bun:test"
import { AppConfig } from "@lister/config"
import { eq } from "drizzle-orm"
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

  test.skipIf(!databaseUrl)("round-trips an exchange enum column through Postgres", async () => {
    const cmcId = 2_000_000_001

    const program = Effect.gen(function*() {
      const { db } = yield* Database

      yield* db.delete(exchangeTable).where(eq(exchangeTable.cmcId, cmcId))

      const [inserted] = yield* db
        .insert(exchangeTable)
        .values({
          cmcId,
          name: "Enum Probe",
          slug: "enum-probe",
          logo: "enum-probe.svg",
          baseCurrency: "idr"
        })
        .returning()

      const [selected] = yield* db.select().from(exchangeTable).where(eq(exchangeTable.cmcId, cmcId))

      yield* db.delete(exchangeTable).where(eq(exchangeTable.cmcId, cmcId))

      return { inserted, selected }
    })

    const { inserted, selected } = await Effect.runPromise(
      program.pipe(Effect.provide(Database.layer()), Effect.provide(AppConfig.layer), Effect.scoped)
    )

    expect(inserted?.baseCurrency).toBe("idr")
    expect(selected?.baseCurrency).toBe("idr")
  })
})
