import { BootstrapCoin, BootstrapContext, CanonicalTick, WorkerRpc, type WorkerStatus } from "@lister/worker-contract"
import {
  Array as Arr,
  Cause,
  Clock,
  Context,
  Duration,
  Effect,
  FiberMap,
  Layer,
  Queue,
  Ref,
  Schedule,
  Schema,
  Stream
} from "effect"
import { RpcClient, RpcClientError, RpcWorker } from "effect/unstable/rpc"
import { Spawner, WorkerPlatform } from "effect/unstable/workers/Worker"
import type { WorkerError } from "effect/unstable/workers/WorkerError"
import { DomainEvents, workerEvent } from "./WorkerEvents.ts"

/**
 * Default maximum coins placed into one worker shard, used for exchanges
 * without a dedicated limit in {@link shardCapacityFor}.
 */
export const shardCapacity = 20 as const

/**
 * Resolve the maximum coins per shard for one exchange.
 *
 * Each exchange enforces its own subscription ceiling in its worker; the
 * supervisor mirrors those limits here so a shard never asks a worker for more
 * pairs than it can subscribe to.
 *
 * @param exchangeSlug - Exchange slug carried in the worker bootstrap message.
 * @returns The exchange's shard capacity, or {@link shardCapacity} when it has
 * no dedicated limit.
 */
export const shardCapacityFor = (exchangeSlug: string): number => {
  switch (exchangeSlug) {
    case "binance":
      return 100
    case "gateio":
      return 50
    default:
      return shardCapacity
  }
}

/**
 * Base delay of the first shard respawn, in milliseconds.
 */
export const respawnBaseDelayMillis = 100 as const

/**
 * Upper bound of shard respawn backoff, in milliseconds.
 */
export const respawnMaxDelayMillis = 5_000 as const

/**
 * Lifecycle phase reported by one shard worker.
 */
export const ShardPhase = Schema.Literals(["starting", "running", "reconnecting"])

/**
 * Lifecycle phase reported by one shard worker.
 */
export type ShardPhase = typeof ShardPhase.Type

/**
 * Observable state of one shard process.
 */
export interface ShardSnapshot {
  /** Supervisor-assigned shard identity, for example `shard-1`. */
  readonly shardId: string
  /** Coins the shard is subscribed to, in placement order. */
  readonly coins: ReadonlyArray<BootstrapCoin>
  /** Current worker-reported reconnect attempt, or `null` outside reconnecting. */
  readonly attempt: number | null
  /** Completed supervisor safety-net recoveries for this shard. */
  readonly restarts: number
  /** Current worker-reported connection phase. */
  readonly phase: ShardPhase
  /** Local epoch-millisecond receipt time of the latest tick, or `null` before the first tick. */
  readonly lastTickAt: number | null
}

/**
 * Observable state of one running exchange.
 */
export interface ExchangeSnapshot {
  /** Database exchange id. */
  readonly exchangeId: number
  /** Exchange slug carried in the worker bootstrap message. */
  readonly exchangeSlug: string
  /** Current shard snapshots in placement order. */
  readonly shards: ReadonlyArray<ShardSnapshot>
}

/**
 * Expected failure: the exchange already has a running shard set.
 */
export class SupervisorConflict extends Schema.TaggedError<SupervisorConflict>()("SupervisorConflict", {
  exchangeId: Schema.Int,
  message: Schema.NonEmptyString.pipe(Schema.check(Schema.isMaxLength(1024)))
}) {}

/**
 * Expected failure while starting a shard or issuing a live command to it.
 */
export class SupervisorSpawnError extends Schema.TaggedError<SupervisorSpawnError>()("SupervisorSpawnError", {
  exchangeId: Schema.Int,
  shardId: Schema.NonEmptyString.pipe(Schema.check(Schema.isMaxLength(64))),
  message: Schema.NonEmptyString.pipe(Schema.check(Schema.isMaxLength(1024))),
  cause: Schema.optional(Schema.Defect())
}) {}

/**
 * Expected failures while changing a running exchange's shard set.
 */
export type ShardChangeError = SupervisorConflict | SupervisorSpawnError

type WorkerRecoveryError = SupervisorSpawnError | WorkerError | RpcClientError.RpcClientError

/**
 * Options for {@link Supervisor.layer}.
 *
 * @template R - Services required by the tick handler at layer construction.
 */
export interface SupervisorLayerOptions<R = never> {
  /** Absolute path of the worker entrypoint used when no resolver is supplied. */
  readonly workerScript: string
  /**
   * Per-exchange worker entrypoint resolver. Defaults to always returning
   * {@link workerScript}; set it to launch `apps/workers/<slug>` entrypoints.
   */
  readonly workerScriptFor?: ((exchangeSlug: string) => string) | undefined
  /**
   * Per-exchange maximum coins per shard resolver. Defaults to
   * {@link shardCapacityFor}; set it to override a specific exchange's ceiling.
   */
  readonly capacityFor?: ((exchangeSlug: string) => number) | undefined
  /**
   * Sink for decoded worker ticks, receiving the tick's exchange and shard
   * context. Failures are the handler's concern; the supervisor never fails a
   * shard because a tick handler failed.
   */
  readonly onTick?: ((tick: CanonicalTick, context: TickContext) => Effect.Effect<void, never, R>) | undefined
}

/**
 * Identity of the exchange and shard that produced a tick.
 */
export interface TickContext {
  /** Database exchange id. */
  readonly exchangeId: number
  /** Exchange slug carried in the worker bootstrap message. */
  readonly exchangeSlug: string
  /** Supervisor-assigned shard identity carried in the worker bootstrap message. */
  readonly shardId: string
}

/**
 * Pure shard placement: chunk an ordered coin list into groups of at most
 * `capacity` coins.
 *
 * @param coins - Coins to place, in eligibility order.
 * @param capacity - Maximum coins per shard.
 * @returns Coin groups, each no larger than `capacity`.
 */
export const shardCoins = (
  coins: ReadonlyArray<BootstrapCoin>,
  capacity: number = shardCapacity
): ReadonlyArray<ReadonlyArray<BootstrapCoin>> => Arr.chunksOf(coins, capacity).map((chunk) => [...chunk])

/**
 * Subscription identity of one coin: `SYMBOL:coingeckoId`.
 *
 * @param coin - Coin to key.
 * @returns The stable subscription key.
 */
export const coinKey = (coin: Pick<BootstrapCoin, "symbol" | "coingeckoId">): string =>
  `${coin.symbol}:${coin.coingeckoId}`

/**
 * Mutable per-shard state owned by the supervisor fiber for that shard.
 *
 * Fields are mutated in place from the owning fiber, which is the only writer;
 * `snapshot` reads them without tearing because JavaScript object field writes
 * are atomic.
 */
interface ShardState {
  readonly shardId: string
  readonly coins: Map<string, BootstrapCoin>
  readonly commands: Queue.Queue<ShardCommand>
  restarts: number
  attempt: number | null
  phase: ShardPhase
  lastTickAt: number | null
}

type ShardCommand =
  | { readonly type: "subscribe"; readonly coins: readonly [BootstrapCoin, ...BootstrapCoin[]] }
  | { readonly type: "unsubscribe"; readonly coins: readonly [BootstrapCoin, ...BootstrapCoin[]] }

/**
 * Mutable per-exchange state owned by the supervisor.
 */
interface ExchangeState {
  readonly exchangeId: number
  readonly exchangeSlug: string
  readonly shards: Map<string, ShardState>
  nextShard: number
}

const shardKey = (exchangeId: number, shardId: string): string => `${exchangeId}/${shardId}`

const recoverySchedule = Schedule.min([
  Schedule.exponential(Duration.millis(respawnBaseDelayMillis)),
  Schedule.spaced(Duration.millis(respawnMaxDelayMillis))
])

/**
 * In-process sharded supervisor for crawler RPC workers.
 *
 * The supervisor owns every running exchange: it chunks the eligible coin set
 * into shards of at most the exchange's configured capacity (see
 * {@link shardCapacityFor}) coins, spawns one Bun worker per shard, forwards
 * RPC ticks and worker status to the configured handlers, and publishes
 * lifecycle events through {@link DomainEvents}.
 *
 * Dead worker streams are re-acquired with capped exponential backoff; workers
 * are bootstrapped from each shard's current coin set. Stopping an exchange
 * terminates its workers and cancels pending recovery. Worker threads are bound
 * to the supervisor scope, so closing the layer terminates everything.
 */
export class Supervisor extends Context.Service<Supervisor, {
  /** Live snapshots of every running exchange, in registration order. */
  readonly snapshot: Effect.Effect<ReadonlyArray<ExchangeSnapshot>>
  /** Whether an exchange currently has a running shard set. */
  readonly isRunning: (exchangeId: number) => Effect.Effect<boolean>
  /**
   * Start a shard set for one exchange.
   *
   * Fails with `SupervisorConflict` when the exchange is already running.
   */
  readonly start: (
    exchangeId: number,
    exchangeSlug: string,
    coins: ReadonlyArray<BootstrapCoin>
  ) => Effect.Effect<void, ShardChangeError>
  /**
   * Terminate every shard of an exchange and cancel pending respawns.
   *
   * Stopping an exchange that is not running succeeds without events.
   */
  readonly stop: (exchangeId: number) => Effect.Effect<void>
  /**
   * Add coins to a running exchange.
   *
   * Each coin fills the first shard with spare capacity, otherwise a new shard
   * is spawned. Coins already placed are ignored, and an exchange that is not
   * running is left untouched.
   */
  readonly addCoins: (
    exchangeId: number,
    coins: ReadonlyArray<BootstrapCoin>
  ) => Effect.Effect<void, ShardChangeError>
  /**
   * Remove coins from a running exchange.
   *
   * A shard emptied by removals is terminated; other shards are untouched.
   */
  readonly removeCoins: (
    exchangeId: number,
    coins: ReadonlyArray<BootstrapCoin>
  ) => Effect.Effect<void, ShardChangeError>
  /** Terminate every shard of every exchange; the supervisor stays usable. */
  readonly shutdown: Effect.Effect<void>
}>()("lister/crawler/Supervisor") {
  /**
   * Scoped layer building a supervisor over the worker platform and crawler
   * {@link DomainEvents} bus.
   *
   * @param options - Worker entrypoint, per-exchange shard capacity, and tick
   * handler.
   * @returns A scoped layer providing a live supervisor.
   */
  static readonly layer = <R = never>(
    options: SupervisorLayerOptions<R>
  ): Layer.Layer<Supervisor, never, WorkerPlatform | DomainEvents | R> =>
    Layer.effect(
      Supervisor,
      Effect.gen(function*() {
        const events = yield* DomainEvents
        const capacityFor = options.capacityFor ?? shardCapacityFor
        const scriptFor = options.workerScriptFor ?? (() => options.workerScript)
        const workers = yield* FiberMap.make<string>()
        const state = yield* Ref.make(new Map<number, ExchangeState>())
        const workerContext = yield* Effect.context<WorkerPlatform>()
        const context = yield* Effect.context<R>()
        const rawOnTick = options.onTick

        const onTick =
          rawOnTick === undefined
            ? (_tick: CanonicalTick, _context: TickContext): Effect.Effect<void> => Effect.void
            : (tick: CanonicalTick, tickContext: TickContext): Effect.Effect<void> =>
              Effect.provideContext(rawOnTick(tick, tickContext), context)

        const makeProtocol = (exchange: ExchangeState, shard: ShardState) =>
          RpcClient.makeProtocolWorker({ size: 1, concurrency: Infinity }).pipe(
            Effect.provideService(Spawner, () => new globalThis.Worker(scriptFor(exchange.exchangeSlug))),
            Effect.provideService(
              RpcWorker.InitialMessage,
              RpcWorker.makeInitialMessage(
                BootstrapContext,
                Effect.sync(() => ({
                  exchangeSlug: exchange.exchangeSlug,
                  shardId: shard.shardId,
                  coins: [...shard.coins.values()]
                }))
              ).pipe(Effect.orDie)
            )
          )

        const makeClient = (protocol: RpcClient.Protocol["Service"]) =>
          RpcClient.make(WorkerRpc).pipe(Effect.provideService(RpcClient.Protocol, protocol))

        const recordRecovery = (exchange: ExchangeState, shard: ShardState) => (error: WorkerRecoveryError) =>
          Effect.gen(function*() {
            shard.restarts += 1
            shard.phase = "starting"
            shard.attempt = null
            yield* Effect.logWarning(
              `supervisor: re-acquiring streams for ${exchange.exchangeSlug}/${shard.shardId}`,
              error
            )
          })

        const dropShard = (exchangeId: number, shardId: string): Effect.Effect<void> =>
          Ref.update(state, (exchanges) => {
            const exchange = exchanges.get(exchangeId)

            if (exchange === undefined || !exchange.shards.has(shardId)) return exchanges

            const shards = new Map(exchange.shards)

            shards.delete(shardId)

            const next = new Map(exchanges)

            if (shards.size === 0) {
              next.delete(exchangeId)
            } else {
              next.set(exchangeId, { ...exchange, shards })
            }

            return next
          })

        const shardFiber = (exchange: ExchangeState, shard: ShardState) =>
          Effect.scoped(
            Effect.gen(function*() {
              const runWorker = Effect.scoped(
                Effect.gen(function*() {
                  const protocol = yield* makeProtocol(exchange, shard)
                  const client = yield* makeClient(protocol)

                  yield* events.publish(
                    yield* workerEvent({
                      type: "shard-spawned",
                      exchangeId: exchange.exchangeId,
                      exchangeSlug: exchange.exchangeSlug,
                      shardId: shard.shardId,
                      message: `shard ${shard.shardId} spawned with ${shard.coins.size} coin(s)`
                    })
                  )

                  yield* Effect.forkScoped(
                    Stream.fromQueue(shard.commands).pipe(
                      Stream.runForEach((command) =>
                        (command.type === "subscribe"
                          ? client.Subscribe({ coins: command.coins })
                          : client.Unsubscribe({ coins: command.coins })
                        ).pipe(
                          Effect.catchCause((cause) =>
                            Cause.hasInterrupts(cause)
                              ? Effect.interrupt
                              : Effect.logWarning(`supervisor: RPC command failed for ${shard.shardId}`, cause)
                          )
                        )
                      )
                    )
                  )

                  const streams = Effect.all(
                    [
                      client.Ticks(undefined).pipe(
                        Stream.runForEach((tick) =>
                          Effect.gen(function*() {
                            shard.lastTickAt = yield* Clock.currentTimeMillis
                            yield* onTick(tick, {
                              exchangeId: exchange.exchangeId,
                              exchangeSlug: exchange.exchangeSlug,
                              shardId: shard.shardId
                            })
                          })
                        )
                      ),
                      client.Status(undefined).pipe(
                        Stream.runForEach((status: WorkerStatus) =>
                          Effect.gen(function*() {
                            shard.phase = status.phase
                            shard.attempt = status.attempt ?? null

                            if (status.phase !== "reconnecting") return

                            const event = {
                              type: "reconnecting" as const,
                              exchangeId: exchange.exchangeId,
                              exchangeSlug: exchange.exchangeSlug,
                              shardId: shard.shardId,
                              message: `shard ${shard.shardId} reconnecting (attempt ${status.attempt ?? "unknown"})`
                            }

                            const published = status.attempt === undefined
                              ? event
                              : { ...event, attempt: status.attempt }

                            yield* events.publish(yield* workerEvent(published))
                          })
                        )
                      )
                    ],
                    { concurrency: "unbounded" }
                  ).pipe(
                    Effect.flatMap(() =>
                      Effect.fail(new SupervisorSpawnError({
                        exchangeId: exchange.exchangeId,
                        shardId: shard.shardId,
                        message: "worker RPC streams ended unexpectedly"
                      }))
                    )
                  )

                  return yield* streams
                })
              )

              return yield* runWorker.pipe(
                Effect.tapError(recordRecovery(exchange, shard)),
                Effect.retry(recoverySchedule)
              )
            })
          ).pipe(
            Effect.ensuring(Queue.shutdown(shard.commands)),
            Effect.ensuring(dropShard(exchange.exchangeId, shard.shardId))
          )

        const spawnShard = (
          exchange: ExchangeState,
          coins: ReadonlyArray<BootstrapCoin>
        ) =>
          Effect.gen(function*() {
            const shardId = `shard-${exchange.nextShard}`

            exchange.nextShard += 1

            const shard: ShardState = {
              shardId,
              coins: new Map(coins.map((coin) => [coinKey(coin), coin])),
              commands: yield* Queue.unbounded<ShardCommand>(),
              restarts: 0,
              attempt: null,
              phase: "starting",
              lastTickAt: null
            }

            exchange.shards.set(shardId, shard)

            yield* FiberMap.run(
              workers,
              shardKey(exchange.exchangeId, shardId),
              Effect.provideContext(shardFiber(exchange, shard), workerContext)
            )
          })

        const requireExchange = (exchangeId: number): Effect.Effect<ExchangeState | undefined> =>
          Effect.map(Ref.get(state), (exchanges) => exchanges.get(exchangeId))

        const stopExchange = (exchangeId: number): Effect.Effect<void> =>
          Effect.gen(function*() {
            const exchange = yield* requireExchange(exchangeId)

            if (exchange === undefined) return

            yield* Ref.update(state, (exchanges) => {
              const next = new Map(exchanges)

              next.delete(exchangeId)

              return next
            })

            yield* Effect.forEach(
              [...exchange.shards.keys()],
              (shardId) => FiberMap.remove(workers, shardKey(exchangeId, shardId)),
              { discard: true }
            )

            yield* events.publish(
              yield* workerEvent({
                type: "stopped",
                exchangeId,
                exchangeSlug: exchange.exchangeSlug,
                shardId: null,
                message: `exchange ${exchange.exchangeSlug} stopped`
              })
            )
          })

        return Supervisor.of({
          snapshot: Effect.gen(function*() {
            const exchanges = yield* Ref.get(state)

            return [...exchanges.values()].map((exchange): ExchangeSnapshot => ({
              exchangeId: exchange.exchangeId,
              exchangeSlug: exchange.exchangeSlug,
              shards: [...exchange.shards.values()].map((shard): ShardSnapshot => ({
                shardId: shard.shardId,
                coins: [...shard.coins.values()],
                attempt: shard.attempt,
                restarts: shard.restarts,
                phase: shard.phase,
                lastTickAt: shard.lastTickAt
              }))
            }))
          }),
          isRunning: (exchangeId) => Effect.map(Ref.get(state), (exchanges) => exchanges.has(exchangeId)),
          start: (exchangeId, exchangeSlug, coins) =>
            Effect.gen(function*() {
              const existing = yield* requireExchange(exchangeId)

              if (existing !== undefined) {
                return yield* new SupervisorConflict({
                  exchangeId,
                  message: `exchange ${exchangeId} is already running`
                })
              }

              const exchange: ExchangeState = {
                exchangeId,
                exchangeSlug,
                shards: new Map(),
                nextShard: 1
              }

              yield* Ref.update(state, (exchanges) => new Map(exchanges).set(exchangeId, exchange))
              yield* events.publish(
                yield* workerEvent({
                  type: "started",
                  exchangeId,
                  exchangeSlug,
                  shardId: null,
                  message: `exchange ${exchangeSlug} started`
                })
              )
              yield* Effect.forEach(shardCoins(coins, capacityFor(exchangeSlug)), (chunk) => spawnShard(exchange, chunk), {
                discard: true
              })
            }),
          stop: (exchangeId) => stopExchange(exchangeId),
          addCoins: (exchangeId, coins) =>
            Effect.gen(function*() {
              const exchange = yield* requireExchange(exchangeId)

              if (exchange === undefined) return

              for (const coin of coins) {
                const key = coinKey(coin)
                const shards = [...exchange.shards.values()]

                if (shards.some((shard) => shard.coins.has(key))) continue

                const target = shards.find((shard) => shard.coins.size < capacityFor(exchange.exchangeSlug))

                if (target === undefined) {
                  yield* spawnShard(exchange, [coin])
                } else {
                  target.coins.set(key, coin)
                  yield* Queue.offer(target.commands, { type: "subscribe", coins: [coin] })
                }
              }
            }),
          removeCoins: (exchangeId, coins) =>
            Effect.gen(function*() {
              const exchange = yield* requireExchange(exchangeId)

              if (exchange === undefined) return

              for (const shard of Array.from(exchange.shards.values())) {
                const removed = coins.filter((coin) => shard.coins.has(coinKey(coin)))

                if (removed.length === 0) continue

                for (const coin of removed) {
                  shard.coins.delete(coinKey(coin))
                }

                if (shard.coins.size === 0) {
                  exchange.shards.delete(shard.shardId)
                  yield* FiberMap.remove(workers, shardKey(exchangeId, shard.shardId))
                } else {
                  const [firstRemoved, ...restRemoved] = removed

                  if (firstRemoved !== undefined) {
                    yield* Queue.offer(shard.commands, { type: "unsubscribe", coins: [firstRemoved, ...restRemoved] })
                  }
                }
              }

              if (exchange.shards.size === 0) {
                yield* Ref.update(state, (exchanges) => {
                  const next = new Map(exchanges)

                  next.delete(exchangeId)

                  return next
                })
              }
            }),
          shutdown: Effect.gen(function*() {
            const exchanges = yield* Ref.get(state)

            yield* Effect.forEach([...exchanges.keys()], stopExchange, { discard: true })
          })
        })
      })
    )
}
