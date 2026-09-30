import { BunRuntime, BunWorkerRunner } from "@effect/platform-bun"
import { ObservabilityLive } from "@lister/observability"
import { runRpcWorker } from "@lister/worker-contract"
import { Effect, Layer } from "effect"
import { RpcServer } from "effect/unstable/rpc"

import { source } from "./source.ts"

BunRuntime.runMain(
  Effect.scoped(runRpcWorker({ exchangeSlug: "huobi", source })).pipe(
    Effect.provide(
      Layer.mergeAll(
        RpcServer.layerProtocolWorkerRunner.pipe(Layer.provideMerge(BunWorkerRunner.layer)),
        ObservabilityLive({ serviceName: "worker-huobi" })
      )
    )
  )
)
