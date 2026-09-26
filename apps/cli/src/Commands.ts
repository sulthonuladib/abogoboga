import { Database } from "@lister/db"
import { Console, Effect } from "effect"
import { Command, Flag } from "effect/unstable/cli"
import {
  defaultSnapshotPath,
  defaultUnmappedChainCode,
  defaultUnmappedChainName,
  fetchSnapshot,
  importSnapshot,
  readSnapshot,
  writeSnapshot
} from "./Scanner.ts"
import { runSweep } from "./Sweep.ts"
import { seedTesterExchanges } from "./TesterExchanges.ts"

/**
 * Split a comma-separated `--exchanges` flag into slugs.
 *
 * @param value - Raw flag value.
 * @returns Non-empty, trimmed slugs; empty when the flag is blank.
 */
export const parseExchangeSlugs = (value: string): ReadonlyArray<string> =>
  value
    .split(",")
    .map((slug) => slug.trim())
    .filter((slug) => slug !== "")

/**
 * Parse the `--delay` flag into a non-negative millisecond count.
 *
 * @param value - Raw flag value.
 * @returns The parsed delay, or `0` when it is malformed.
 */
export const parseDelayMillis = (value: string): number => {
  const parsed = Number(value)

  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0
}

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

const seed = Command.make("seed").pipe(
  Command.withDescription("Seed reference data"),
  Command.withSubcommands([seedTester])
)

const scanFetch = Command.make(
  "fetch",
  {
    exchanges: Flag.String("exchanges").pipe(
      Flag.withDescription("Comma-separated exchange slugs to fetch (default: every target)"),
      Flag.withDefault("")
    ),
    output: Flag.String("output").pipe(
      Flag.withDescription("Snapshot JSON file to write"),
      Flag.withDefault(defaultSnapshotPath)
    ),
    delay: Flag.String("delay").pipe(
      Flag.withDescription("Milliseconds to wait between ticker pages"),
      Flag.withDefault("2000")
    )
  },
  Effect.fn("scanFetch")(function*({ exchanges, output, delay }) {
    const snapshot = yield* fetchSnapshot({
      exchanges: parseExchangeSlugs(exchanges),
      delayMillis: parseDelayMillis(delay)
    })

    yield* writeSnapshot(output, snapshot)

    yield* Console.log(
      `Fetched ${snapshot.exchanges.length} exchange(s) and ${snapshot.coins.length} coin(s) into ${output}.`
    )
  })
).pipe(Command.withDescription("Fetch target exchanges from CoinGecko into a JSON snapshot"))

const scanImport = Command.make(
  "import",
  {
    file: Flag.String("file").pipe(
      Flag.withDescription("Snapshot JSON file to import"),
      Flag.withDefault(defaultSnapshotPath)
    ),
    unmappedName: Flag.String("unmapped-name").pipe(
      Flag.withDescription("Name for the fallback chain every market is linked to"),
      Flag.withDefault(defaultUnmappedChainName)
    ),
    unmappedCode: Flag.String("unmapped-code").pipe(
      Flag.withDescription("Code for the fallback chain and its chain links"),
      Flag.withDefault(defaultUnmappedChainCode)
    )
  },
  Effect.fn("scanImport")(function*({ file, unmappedName, unmappedCode }) {
    const snapshot = yield* readSnapshot(file)
    const summary = yield* importSnapshot(snapshot, { chainName: unmappedName, chainCode: unmappedCode })

    yield* Console.log(
      `Imported ${summary.cryptocurrencies} cryptocurrencies, ${summary.exchanges} exchanges, ${summary.markets} markets, and ${summary.chainLinks} chain links.`
    )
  })
).pipe(Command.withDescription("Import a CoinGecko snapshot into the database"))

const scan = Command.make("scan").pipe(
  Command.withDescription("Fetch and import exchange metadata from CoinGecko"),
  Command.withSubcommands([scanFetch, scanImport])
)

const migrate = Command.make(
  "migrate",
  {},
  Effect.fn("migrate")(function*() {
    yield* Database

    yield* Console.log("Database migrations applied.")
  })
).pipe(Command.withDescription("Apply pending database migrations"))

const sweep = Command.make("sweep", {}, runSweep).pipe(
  Command.withDescription("Terminate orphaned crawler worker processes")
)

/**
 * Complete `lister` command tree: `scan`, `seed`, `migrate`, and `sweep`.
 */
export const cli = Command.make("lister").pipe(
  Command.withDescription("Lister database and crawler operations"),
  Command.withSubcommands([scan, seed, migrate, sweep])
)
