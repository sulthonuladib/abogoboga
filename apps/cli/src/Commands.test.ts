import { describe, expect, test } from "bun:test"
import { BunServices } from "@effect/platform-bun"
import {
  Database,
  cryptocurrencyTable,
  exchangeCryptocurrencyTable,
  exchangeTable
} from "@lister/db"
import { Effect, Layer } from "effect"
import { Command } from "effect/unstable/cli"
import { mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { cli } from "./Commands.ts"
import type { CoinFile } from "./CoinData.ts"

const runCli = Command.runWith(cli, { version: "1.0.0" })

const writePayload = (fileName: string, payload: CoinFile): string => {
  const directory = mkdtempSync(join(tmpdir(), "lister-cli-"))
  const file = join(directory, fileName)

  writeFileSync(file, JSON.stringify(payload))

  return file
}

const firstPayload: CoinFile = {
  data: [
    {
      cmcId: 1,
      name: "Bitcoin",
      symbol: "BTC",
      slug: "bitcoin",
      binance: true,
      binanceAlternateSymbol: "BTCUSDT"
    },
    {
      cmcId: 2,
      name: "Ethereum",
      symbol: "ETH",
      slug: "ethereum",
      binance: true,
      binanceAlternateSymbol: "ETHUSDT"
    }
  ]
}

const updatedPayload: CoinFile = {
  data: [
    {
      cmcId: 1,
      name: "Bitcoin Cash",
      symbol: "BCH",
      slug: "bitcoin-cash",
      binance: true,
      binanceAlternateSymbol: "BCHUSDT"
    },
    {
      cmcId: 2,
      name: "Ethereum",
      symbol: "ETH",
      slug: "ethereum",
      binance: true,
      binanceAlternateSymbol: "ETHUSDT"
    }
  ]
}

describe("lister cli", () => {
  test("seed coin-data upserts idempotently through the Database service", async () => {
    const file = writePayload("cmc.json", firstPayload)

    const program = Effect.gen(function*() {
      yield* runCli(["seed", "coin-data", "--file", file])
      yield* runCli(["seed", "coin-data", "--file", file])

      const { db } = yield* Database

      return {
        coins: yield* db.select().from(cryptocurrencyTable),
        exchanges: yield* db.select().from(exchangeTable),
        assignments: yield* db.select().from(exchangeCryptocurrencyTable)
      }
    })

    const result = await Effect.runPromise(
      program.pipe(
        Effect.provide(Layer.merge(Database.layerMemory(), BunServices.layer)),
        Effect.scoped
      )
    )

    expect(result.coins).toHaveLength(2)
    expect(result.exchanges).toHaveLength(8)
    expect(result.assignments).toHaveLength(2)
  })

  test("seed coin-data refreshes conflicting rows without duplicating them", async () => {
    const firstFile = writePayload("first.json", firstPayload)
    const updatedFile = writePayload("updated.json", updatedPayload)

    const program = Effect.gen(function*() {
      yield* runCli(["seed", "coin-data", "--file", firstFile])
      yield* runCli(["seed", "coin-data", "--file", updatedFile])

      const { db } = yield* Database
      const coins = yield* db.select().from(cryptocurrencyTable)
      const assignments = yield* db.select().from(exchangeCryptocurrencyTable)

      return {
        coins,
        bitcoin: coins.find((coin) => coin.cmcId === 1),
        assignment: assignments.find((assignment) => assignment.cryptocurrencyId === 1)
      }
    })

    const result = await Effect.runPromise(
      program.pipe(
        Effect.provide(Layer.merge(Database.layerMemory(), BunServices.layer)),
        Effect.scoped
      )
    )

    expect(result.coins).toHaveLength(2)
    expect(result.bitcoin?.name).toBe("Bitcoin Cash")
    expect(result.bitcoin?.symbol).toBe("BCH")
    expect(result.bitcoin?.slug).toBe("bitcoin-cash")
    expect(result.assignment?.exchangeSymbol).toBe("BCHUSDT")
  })

  test("migrate applies migrations against the provided database", async () => {
    await Effect.runPromise(
      runCli(["migrate"]).pipe(
        Effect.provide(Layer.merge(Database.layerMemory(), BunServices.layer)),
        Effect.scoped
      )
    )
  })
})
