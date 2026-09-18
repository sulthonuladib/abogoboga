import { BunRuntime, BunServices } from "@effect/platform-bun"
import { AppConfig } from "@lister/config"
import { Database } from "@lister/db"
import { Effect, Layer } from "effect"
import { Command } from "effect/unstable/cli"
import { cli } from "./Commands.ts"

const databaseLayer = Database.layer().pipe(Layer.provide(AppConfig.layer))

// Only the `seed` and `migrate` commands touch Postgres. Selecting the layer by
// subcommand keeps `sweep` (and `--help`) from opening a connection or applying
// migrations. Help/version flags skip the database even under `seed`/`migrate`
// so `lister seed --help` works offline. Commands stay layer-agnostic so tests
// can provide `Database.layerMemory()` instead.
const helpFlags = new Set(["--help", "-h", "--version", "-v", "--wizard", "--completions"])

const wantsHelp = process.argv.slice(2).some((argument) => helpFlags.has(argument))

const needsDatabase =
  !wantsHelp && (process.argv[2] === "migrate" || process.argv[2] === "seed")

const services = needsDatabase ? Layer.merge(databaseLayer, BunServices.layer) : BunServices.layer

// SAFETY: `Command.run` infers `unknown` for E/R on Effect v4 RC (`cli` unions
// handlers with different service needs). `services` satisfies every concrete
// requirement at runtime, so narrow to `never` for `runMain`. Proper fix
// (explicit handler Return types) belongs to a later pass.
const main = Command.run(cli, { version: "1.0.0" }).pipe(
  Effect.provide(services)
) as Effect.Effect<void, unknown, never>

BunRuntime.runMain(main)
