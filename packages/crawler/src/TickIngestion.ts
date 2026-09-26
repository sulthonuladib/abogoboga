import { type CanonicalTick } from "@lister/worker-contract"
import { Context, Effect, Layer, Option, Schema } from "effect"
import { processTick, type QuoteCurrency } from "./QuotePipeline.ts"
import type { TickContext } from "./Supervisor.ts"

/**
 * Resolved identity and quote currency for one exchange coin mapping.
 */
export interface ExchangeCryptocurrencyRef {
  /** Primary key of the `exchange_cryptocurrency` mapping. */
  readonly exchangeCryptocurrencyId: number
  /** Quote currency the exchange's books are denominated in. */
  readonly quoteCurrency: QuoteCurrency
}

/**
 * Persistence port resolving a tick's `(exchangeId, coingeckoId)` into a mapping.
 */
export type MarketMappingsService = {
  /** Look up the mapping for one exchange and CoinGecko id. */
  readonly lookup: (
    exchangeId: number,
    coingeckoId: string
  ) => Effect.Effect<Option.Option<ExchangeCryptocurrencyRef>>
}

/**
 * Persistence port resolving tick identities.
 */
export class MarketMappings extends Context.Service<MarketMappings, MarketMappingsService>()(
  "lister/crawler/MarketMappings"
) {}

/**
 * One executable orderbook snapshot row to persist.
 */
export interface OrderbookSnapshotWrite {
  /** Database exchange id. */
  readonly exchangeId: number
  /** Mapping primary key the snapshot belongs to. */
  readonly exchangeCryptocurrencyId: number
  /** Marginal ask price in IDR (the buy price). */
  readonly buyPrice: number
  /** Marginal bid price in IDR (the sell price). */
  readonly sellPrice: number
  /** Base amount bought to reach the volume target. */
  readonly buyAmount: number
  /** Base amount sold to reach the volume target. */
  readonly sellAmount: number
  /** Worker-supplied tick timestamp in epoch milliseconds. */
  readonly tickTimestamp: number
}

/**
 * Persistence port upserting executable snapshots.
 */
export type OrderbookSnapshotsService = {
  /** Upsert the snapshot for a mapping, replacing any previous row. */
  readonly upsert: (snapshot: OrderbookSnapshotWrite) => Effect.Effect<void>
}

/**
 * Persistence port upserting executable snapshots.
 */
export class OrderbookSnapshots extends Context.Service<OrderbookSnapshots, OrderbookSnapshotsService>()(
  "lister/crawler/OrderbookSnapshots"
) {}

/**
 * Expected failure: a tick arrived for a coin with no mapping on its exchange.
 */
export class TickMappingNotFound extends Schema.TaggedError<TickMappingNotFound>()("TickMappingNotFound", {
  exchangeId: Schema.Int,
  exchangeSlug: Schema.NonEmptyString.pipe(Schema.check(Schema.isMaxLength(255))),
  coingeckoId: Schema.NonEmptyString.pipe(Schema.check(Schema.isMaxLength(255)))
}) {}

/**
 * Tick pipeline application service.
 *
 * Converts canonical ticks into executable quotes and upserts one snapshot per
 * market mapping. Thin books leave the stored snapshot untouched, and ticks for
 * unmapped coins fail with {@link TickMappingNotFound} so the caller can decide
 * whether to log or drop them.
 */
export class TickIngestion extends Context.Service<TickIngestion, {
  /**
   * Ingest one tick from a shard.
   *
   * Fails with `TickMappingNotFound` when the coin has no mapping on the
   * exchange; every other outcome is a persisted snapshot or a skipped thin
   * book.
   */
  readonly ingest: (tick: CanonicalTick, context: TickContext) => Effect.Effect<void, TickMappingNotFound>
}>()("lister/crawler/TickIngestion") {
  /**
   * Layer wiring the pipeline to its persistence ports.
   */
  static readonly layer: Layer.Layer<TickIngestion, never, MarketMappings | OrderbookSnapshots> = Layer.effect(
    TickIngestion,
    Effect.gen(function*() {
      const mappings = yield* MarketMappings
      const snapshots = yield* OrderbookSnapshots

      const ingest = (tick: CanonicalTick, context: TickContext): Effect.Effect<void, TickMappingNotFound> =>
        Effect.gen(function*() {
          const ref = yield* mappings.lookup(context.exchangeId, tick.coingeckoId)

          if (Option.isNone(ref)) {
            return yield* new TickMappingNotFound({
              exchangeId: context.exchangeId,
              exchangeSlug: context.exchangeSlug,
              coingeckoId: tick.coingeckoId
            })
          }

          const quote = processTick(tick, ref.value.quoteCurrency)

          if (quote === null) {
            yield* Effect.logDebug(`thin book skipped ${tick.symbol}`)

            return
          }

          yield* snapshots.upsert({
            exchangeId: context.exchangeId,
            exchangeCryptocurrencyId: ref.value.exchangeCryptocurrencyId,
            buyPrice: quote.buyPrice,
            sellPrice: quote.sellPrice,
            buyAmount: quote.buyAmount,
            sellAmount: quote.sellAmount,
            tickTimestamp: tick.timestamp
          })
        }).pipe(
          Effect.annotateLogs({ exchange: context.exchangeSlug, shard: context.shardId }),
          Effect.withSpan("TickIngestion.ingest", {
            attributes: { exchange: context.exchangeSlug, shard: context.shardId }
          })
        )

      return TickIngestion.of({ ingest })
    })
  )
}
