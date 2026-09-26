import { BunRuntime, BunWorkerRunner } from "@effect/platform-bun"
import { runRpcWorker } from "@lister/worker-contract"
import { Effect, Layer } from "effect"
import { RpcServer } from "effect/unstable/rpc"

import { source } from "./source.ts"

BunRuntime.runMain(
  Effect.scoped(runRpcWorker({ exchangeSlug: "indodax-single", source })).pipe(
    Effect.provide(RpcServer.layerProtocolWorkerRunner.pipe(Layer.provideMerge(BunWorkerRunner.layer)))
  )
)
