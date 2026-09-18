import { BunRuntime } from "@effect/platform-bun"
import { runStdioWorker } from "@lister/worker-contract"

import { source } from "./source.ts"

BunRuntime.runMain(runStdioWorker({ exchangeSlug: "dummy", source }))
