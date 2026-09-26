import { describe, expect, test } from "bun:test"
import { AppConfig } from "@lister/config"
import { eq } from "drizzle-orm"
import { Effect, Layer } from "effect"
import { Database } from "./Database.ts"
import { exchangeTable } from "./schema.ts"

const databaseUrl = process.env.DATABASE_URL

const databaseLayer = Database.layer().pipe(Layer.provide(AppConfig.layer))

describe("Database", () => {
  test.skipIf(!databaseUrl)("builds against the configured Postgres and applies migrations", async () => {
    const program = Effect.gen(function*() {
      const database = yield* Database

      return yield* database.db.select().from(exchangeTable).limit(1)
    })

    const rows = await Effect.runPromise(
      program.pipe(Effect.provide(databaseLayer), Effect.scoped)
    )

    expect(rows).toBeArray()
  })

  test.skipIf(!databaseUrl)("round-trips an exchange enum column through Postgres", async () => {
    const coingeckoId = "enum-probe-2000000001"

    const program = Effect.gen(function*() {
      const { db } = yield* Database

      yield* db.delete(exchangeTable).where(eq(exchangeTable.coingeckoId, coingeckoId))

      const [inserted] = yield* db
        .insert(exchangeTable)
        .values({
          coingeckoId,
          name: "Enum Probe",
          slug: "enum-probe",
          logo: "enum-probe.svg",
          baseCurrency: "idr"
        })
        .returning()

      const [selected] = yield* db.select().from(exchangeTable).where(eq(exchangeTable.coingeckoId, coingeckoId))

      yield* db.delete(exchangeTable).where(eq(exchangeTable.coingeckoId, coingeckoId))

      return { inserted, selected }
    })

    const { inserted, selected } = await Effect.runPromise(
      program.pipe(Effect.provide(databaseLayer), Effect.scoped)
    )

    expect(inserted?.baseCurrency).toBe("idr")
    expect(selected?.baseCurrency).toBe("idr")
  })
})
