import { BunRuntime, BunWorkerRunner } from "@effect/platform-bun"
import { runRpcWorker } from "@lister/worker-contract"
import { source } from "../../../../apps/workers/dummy/src/source.ts"
import { Effect, Layer } from "effect"
import { RpcServer } from "effect/rpc"

BunRuntime.runMain(
  runRpcWorker({ exchangeSlug: "graceful-close", source }).pipe(
    Effect.scoped,
    Effect.provide(RpcServer.layerProtocolWorkerRunner.pipe(Layer.provideMerge(BunWorkerRunner.layer)))
  )
)
