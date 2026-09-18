import { Database } from "@lister/db"
import { Console, Effect, FileSystem } from "effect"
import { Command, Flag } from "effect/unstable/cli"
import { importCoinData, parseCoinDataJson } from "./CoinData.ts"
import { seedTesterExchanges } from "./TesterExchanges.ts"

/**
 * Default path of the CMC export consumed by `lister seed coin-data`.
 */
export const defaultCoinDataPath = "/tmp/arbitrator-cmc-result.json"

const seedCoinData = Command.make(
  "coin-data",
  {
    file: Flag.String("file").pipe(
      Flag.withDescription("Path to the CMC export JSON file"),
      Flag.withDefault(defaultCoinDataPath)
    )
  },
  Effect.fn("seedCoinData")(function*({ file }) {
    const fileSystem = yield* FileSystem.FileSystem
    const raw = yield* fileSystem.readFileString(file)
    const coins = yield* parseCoinDataJson(raw)
    const summary = yield* importCoinData(coins)

    yield* Console.log(
      `Imported ${summary.cryptocurrencies} cryptocurrencies, ${summary.exchanges} exchanges, and ${summary.assignments} assignments.`
    )
  })
).pipe(Command.withDescription("Import a CMC coin export into the database"))

const seedTester = Command.make(
  "tester",
  {},
  Effect.fn("seedTester")(function*() {
    const summary = yield* seedTesterExchanges()

    yield* Console.log(
      `Seeded ${summary.exchanges} tester exchanges, ${summary.coins} coins, ${summary.mappings} mappings.`
    )

    for (const [slug, count] of Object.entries(summary.eligibility)) {
      yield* Console.log(`Eligible on ${slug}: ${count} coins.`)
    }
  })
).pipe(Command.withDescription("Seed tester exchanges and their eligible coins"))

/**
 * `seed` command with `coin-data` and `tester` subcommands.
 */
export const seedCommand = Command.make("seed").pipe(
  Command.withDescription("Seed reference data"),
  Command.withSubcommands([seedCoinData, seedTester])
)

/**
 * `migrate` command: builds the `Database` layer, which applies migrations.
 */
export const migrateCommand = Command.make(
  "migrate",
  {},
  Effect.fn("migrate")(function*() {
    yield* Database

    yield* Console.log("Database migrations applied.")
  })
).pipe(Command.withDescription("Apply pending database migrations"))
