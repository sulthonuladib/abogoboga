import { BunRuntime, BunServices } from "@effect/platform-bun"
import { AppConfig } from "@lister/config"
import { Database } from "@lister/db"
import { Effect, Layer } from "effect"
import { Command } from "effect/unstable/cli"
import { cli } from "./Commands.ts"

const databaseLayer = Database.layer().pipe(Layer.provide(AppConfig.layer))

// The Database layer is built lazily, so `sweep` never opens a connection,
// while `seed` and `migrate` read AppConfig and apply migrations on first use.
// SAFETY: `Command.run` infers `unknown` for E/R on Effect v4 RC (`cli` unions
// four handlers). `databaseLayer` + `BunServices.layer` satisfy every concrete
// requirement at runtime. Narrow to `never` requirements so `runMain` accepts
// the fully-provided program. Proper fix (explicit handler Return types)
// belongs to 9.x.
const main = Command.run(cli, { version: "1.0.0" }).pipe(
  Effect.provide(Layer.merge(databaseLayer, BunServices.layer))
) as Effect.Effect<void, unknown, never>

BunRuntime.runMain(main)
