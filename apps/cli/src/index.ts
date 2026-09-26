import { BunRuntime, BunServices } from "@effect/platform-bun"
import { AppConfig } from "@lister/config"
import { Database } from "@lister/db"
import { Effect, Layer } from "effect"
import { Command } from "effect/unstable/cli"
import { CoinGecko } from "./CoinGecko.ts"
import { cli } from "./Commands.ts"

const databaseLayer = Database.layer().pipe(Layer.provide(AppConfig.layer))

// CoinGecko is only used by `scan fetch`, but building its layer is cheap and
// keeps the command handlers free of layer wiring.
const baseServices = Layer.merge(BunServices.layer, CoinGecko.layer)

// Only the `seed`, `migrate`, and `scan import` commands touch Postgres.
// Selecting the layer by subcommand keeps `sweep`, `scan fetch`, and `--help`
// from opening a connection or applying migrations. Help/version flags skip the
// database even under the commands above so `lister seed --help` works offline.
// Commands stay layer-agnostic so tests can provide `Database.layerMemory()`.
const helpFlags = new Set(["--help", "-h", "--version", "-v", "--wizard", "--completions"])

const wantsHelp = process.argv.slice(2).some((argument) => helpFlags.has(argument))

const command = process.argv[2]

const subcommand = process.argv[3]

const needsDatabase =
  !wantsHelp &&
  (command === "migrate" || command === "seed" || (command === "scan" && subcommand === "import"))

const services = needsDatabase ? Layer.merge(databaseLayer, baseServices) : baseServices

// SAFETY: `Command.run` infers `unknown` for E/R on Effect v4 RC (`cli` unions
// handlers with different service needs). `services` satisfies every concrete
// requirement at runtime, so narrow to `never` for `runMain`. Proper fix
// (explicit handler Return types) belongs to a later pass.
const main = Command.run(cli, { version: "1.0.0" }).pipe(
  Effect.provide(services)
) as Effect.Effect<void, unknown, never>

BunRuntime.runMain(main)
