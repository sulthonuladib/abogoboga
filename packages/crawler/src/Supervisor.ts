import { BootstrapCoin, CanonicalTick, WorkerCommand, decodeTickLine, encodeCommandLine, workerArgvMarker } from "@lister/worker-contract"
import {
  Array as Arr,
  Cause,
  Context,
  Duration,
  Effect,
  FiberMap,
  Layer,
  Queue,
  Ref,
  Schema,
  Stream
} from "effect"
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process"
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
 * @param exchangeSlug - Exchange slug carried in worker argv.
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
 * Lifecycle phase of one shard process.
 */
export const ShardPhase = Schema.Literals(["starting", "running", "backoff"])

/**
 * Lifecycle phase of one shard process.
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
  /** Operating-system process id, or `null` while a respawn is pending. */
  readonly pid: number | null
  /** Completed crash respawns for this shard. */
  readonly restarts: number
  /** Current lifecycle phase. */
  readonly phase: ShardPhase
}

/**
 * Observable state of one running exchange.
 */
export interface ExchangeSnapshot {
  /** Database exchange id. */
  readonly exchangeId: number
  /** Exchange slug carried in worker argv. */
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
 * Expected failure while spawning a shard or writing a live command to it.
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

/**
 * Options for {@link Supervisor.layer}.
 *
 * @template R - Services required by the tick handler at layer construction.
 */
export interface SupervisorLayerOptions<R = never> {
  /** Absolute path of the worker entrypoint spawned for each shard. */
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
  /** Sink for worker stderr lines. */
  readonly onLog?: ((line: string) => Effect.Effect<void, never, never>) | undefined
}

/**
 * Identity of the exchange and shard that produced a tick.
 */
export interface TickContext {
  /** Database exchange id. */
  readonly exchangeId: number
  /** Exchange slug carried in worker argv. */
  readonly exchangeSlug: string
  /** Supervisor-assigned shard identity. */
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
 * Build the argv that launches one worker shard.
 *
 * @param workerScript - Absolute path of the worker entrypoint.
 * @param exchangeSlug - Exchange slug carried in the argv signature.
 * @param shardId - Shard identity carried in the argv signature.
 * @param coins - Bootstrap coins for the shard.
 * @returns The full argv, starting with the `bun` executable.
 */
export const buildWorkerArgv = (
  workerScript: string,
  exchangeSlug: string,
  shardId: string,
  coins: ReadonlyArray<BootstrapCoin>
): ReadonlyArray<string> => [
  "bun",
  workerScript,
  workerArgvMarker,
  exchangeSlug,
  shardId,
  coins.map((coin) => `${coin.symbol}:${coin.coingeckoId}`).join(",")
]

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
  handle: ChildProcessSpawner.ChildProcessHandle | null
  stdin: Queue.Queue<Uint8Array> | null
  restarts: number
  phase: ShardPhase
}

/**
 * Mutable per-exchange state owned by the supervisor.
 */
interface ExchangeState {
  readonly exchangeId: number
  readonly exchangeSlug: string
  readonly shards: Map<string, ShardState>
  nextShard: number
}

const exitCodeNumber = (code: ChildProcessSpawner.ExitCode): number => Number(code)

const textEncoder = new TextEncoder()

const shardKey = (exchangeId: number, shardId: string): string => `${exchangeId}/${shardId}`

const backoffFor = (attempt: number): number =>
  Math.min(respawnBaseDelayMillis * 2 ** attempt, respawnMaxDelayMillis)

/**
 * In-process sharded supervisor for crawler worker subprocesses.
 *
 * The supervisor owns every running exchange: it chunks the eligible coin set
 * into shards of at most the exchange's configured capacity (see
 * {@link shardCapacityFor}) coins, spawns one
 * `ChildProcessSpawner` handle per shard, forwards stdout ticks and stderr logs
 * to the configured handlers, and publishes lifecycle events through
 * {@link DomainEvents}.
 *
 * A crashed shard is respawned with the same coin set after capped exponential
 * backoff; a clean exit drops the shard from tracking; stopping an exchange
 * terminates its shards and cancels pending respawns. Shard processes are bound
 * to the supervisor `Scope`, so closing the layer terminates everything.
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
   * Scoped layer building a supervisor over the platform child-process spawner
   * and the crawler {@link DomainEvents} bus.
   *
   * @param options - Worker script, per-exchange shard capacity, and tick/log
   * handlers.
   * @returns A scoped layer providing a live supervisor.
   */
  static readonly layer = <R = never>(
    options: SupervisorLayerOptions<R>
  ): Layer.Layer<Supervisor, never, ChildProcessSpawner.ChildProcessSpawner | DomainEvents | R> =>
    Layer.effect(
      Supervisor,
      Effect.gen(function*() {
        const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
        const events = yield* DomainEvents
        const capacityFor = options.capacityFor ?? shardCapacityFor
        const scriptFor = options.workerScriptFor ?? (() => options.workerScript)
        const workers = yield* FiberMap.make<string>()
        const state = yield* Ref.make(new Map<number, ExchangeState>())
        const log = options.onLog ?? (() => Effect.void)
        const context = yield* Effect.context<R>()
        const rawOnTick = options.onTick

        const onTick =
          rawOnTick === undefined
            ? (_tick: CanonicalTick, _context: TickContext): Effect.Effect<void> => Effect.void
            : (tick: CanonicalTick, tickContext: TickContext): Effect.Effect<void> =>
              Effect.provideContext(rawOnTick(tick, tickContext), context)

        const workerCommand = (
          exchangeSlug: string,
          shardId: string,
          coins: ReadonlyArray<BootstrapCoin>
        ): ChildProcess.Command =>
          ChildProcess.make("bun", buildWorkerArgv(scriptFor(exchangeSlug), exchangeSlug, shardId, coins).slice(1), {
            extendEnv: true
          })

        const writeCommand = (shard: ShardState, command: WorkerCommand): Effect.Effect<void> =>
          Effect.gen(function*() {
            const stdin = shard.stdin

            if (stdin === null) return

            yield* Queue.offer(stdin, textEncoder.encode(`${encodeCommandLine(command)}\n`))
          }).pipe(
            Effect.catchCause((cause) =>
              Cause.hasInterrupts(cause)
                ? Effect.interrupt
                : Effect.logWarning(`supervisor: stdin write failed for ${shard.shardId}`, cause)
            )
          )

        const consumeTicks = (
          handle: ChildProcessSpawner.ChildProcessHandle,
          exchange: ExchangeState,
          shardId: string
        ) =>
          handle.stdout.pipe(
            Stream.decodeText(),
            Stream.splitLines,
            Stream.map((line) => decodeTickLine(line)),
            Stream.filter((tick): tick is CanonicalTick => tick !== null),
            Stream.mapEffect((tick) =>
              onTick(tick, { exchangeId: exchange.exchangeId, exchangeSlug: exchange.exchangeSlug, shardId })
            ),
            Stream.runDrain,
            Effect.annotateLogs({ exchangeSlug: exchange.exchangeSlug, shardId }),
            Effect.catchCause((cause) => (Cause.hasInterrupts(cause) ? Effect.interrupt : Effect.void))
          )

        const consumeLogs = (
          handle: ChildProcessSpawner.ChildProcessHandle,
          exchangeSlug: string,
          shardId: string
        ) =>
          handle.stderr.pipe(
            Stream.decodeText(),
            Stream.splitLines,
            Stream.runForEach((line) => log(line)),
            Effect.annotateLogs({ exchangeSlug, shardId }),
            Effect.catchCause((cause) => (Cause.hasInterrupts(cause) ? Effect.interrupt : Effect.void))
          )

        const isRegistered = (exchangeId: number, shardId: string): Effect.Effect<boolean> =>
          Effect.map(Ref.get(state), (exchanges) => {
            const exchange = exchanges.get(exchangeId)

            return exchange !== undefined && exchange.shards.has(shardId)
          })

        const runProcess = (
          exchange: ExchangeState,
          shard: ShardState
        ) =>
          Effect.gen(function*() {
            const coins = [...shard.coins.values()]

            const handle = yield* spawner
              .spawn(workerCommand(exchange.exchangeSlug, shard.shardId, coins))
              .pipe(
                Effect.catchCause((cause) =>
                  Cause.hasInterrupts(cause)
                    ? Effect.interrupt
                    : Effect.fail(
                      new SupervisorSpawnError({
                        exchangeId: exchange.exchangeId,
                        shardId: shard.shardId,
                        message: "failed to spawn worker shard",
                        cause
                      })
                    )
                )
              )

            shard.handle = handle
            shard.phase = "running"

            const stdin = yield* Queue.unbounded<Uint8Array>()

            shard.stdin = stdin

            yield* Effect.forkScoped(Stream.fromQueue(stdin).pipe(Stream.run(handle.stdin)))

            if (coins.length > 0) {
              const [first, ...rest] = coins

              if (first !== undefined) {
                yield* writeCommand(shard, { type: "subscribe", coins: [first, ...rest] })
              }
            }

            yield* events.publish(
              yield* workerEvent({
                type: "shard-spawned",
                exchangeId: exchange.exchangeId,
                exchangeSlug: exchange.exchangeSlug,
                shardId: shard.shardId,
                message: `shard ${shard.shardId} spawned with ${coins.length} coin(s)`
              })
            )

            yield* Effect.forkScoped(consumeTicks(handle, exchange, shard.shardId))
            yield* Effect.forkScoped(consumeLogs(handle, exchange.exchangeSlug, shard.shardId))

            const code = yield* handle.exitCode.pipe(
              Effect.catchCause((cause) =>
                Cause.hasInterrupts(cause) ? Effect.interrupt : Effect.succeed(ChildProcessSpawner.ExitCode(1))
              )
            )

            shard.handle = null
            shard.stdin = null

            return exitCodeNumber(code)
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
          Effect.gen(function*() {
            while (yield* isRegistered(exchange.exchangeId, shard.shardId)) {
              const exit = yield* Effect.scoped(runProcess(exchange, shard)).pipe(
                Effect.catchTag("SupervisorSpawnError", (error) =>
                  Effect.gen(function*() {
                    yield* Effect.logError(`supervisor: ${error.message}`, error.cause)

                    return 1
                  })
                )
              )

              if (!(yield* isRegistered(exchange.exchangeId, shard.shardId))) return

              if (exit === 0) {
                yield* events.publish(
                  yield* workerEvent({
                    type: "shard-exited",
                    exchangeId: exchange.exchangeId,
                    exchangeSlug: exchange.exchangeSlug,
                    shardId: shard.shardId,
                    message: `shard ${shard.shardId} exited cleanly`
                  })
                )

                return
              }

              const attempt = shard.restarts
              const delay = backoffFor(attempt)

              shard.restarts = attempt + 1
              shard.phase = "backoff"

              yield* events.publish(
                yield* workerEvent({
                  type: "respawn-scheduled",
                  exchangeId: exchange.exchangeId,
                  exchangeSlug: exchange.exchangeSlug,
                  shardId: shard.shardId,
                  message: `respawn ${attempt + 1} for shard ${shard.shardId} in ${delay}ms`
                })
              )

              yield* Effect.sleep(Duration.millis(delay))
            }
          }).pipe(Effect.ensuring(dropShard(exchange.exchangeId, shard.shardId)))

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
              handle: null,
              stdin: null,
              restarts: 0,
              phase: "starting"
            }

            exchange.shards.set(shardId, shard)

            yield* FiberMap.run(workers, shardKey(exchange.exchangeId, shardId), shardFiber(exchange, shard))
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
                pid: shard.handle === null ? null : Number(shard.handle.pid),
                restarts: shard.restarts,
                phase: shard.phase
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
                  yield* writeCommand(target, { type: "subscribe", coins: [coin] })
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
                    yield* writeCommand(shard, { type: "unsubscribe", coins: [firstRemoved, ...restRemoved] })
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
