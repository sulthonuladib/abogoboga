import { type CanonicalTick } from "@lister/worker-contract"
import { Context, Effect, Layer, Option, Schema } from "effect"
import { IdrRate } from "./IdrRate.ts"
import { OpportunityWriter } from "./OpportunityWriter.ts"
import { processTick, type QuoteCurrency } from "./QuotePipeline.ts"
import type { TickContext } from "./Supervisor.ts"

/**
 * Resolved identity and quote currency for one exchange coin mapping.
 */
export interface ExchangeCryptocurrencyRef {
  /** Primary key of the `cryptocurrency` the mapping points at. */
  readonly cryptocurrencyId: number
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
 * Resolves the tick's mapping and the current {@link IdrRate}, walks the book
 * to the volume target, then records the buy and sell sides with the
 * {@link OpportunityWriter}, which coalesces them into one transaction per
 * flush. Thin books leave the row untouched, a coin with no opportunity rows
 * updates nothing, and ticks for unmapped coins fail with
 * {@link TickMappingNotFound} so the caller can decide whether to log or drop
 * them.
 */
export class TickIngestion extends Context.Service<TickIngestion, {
  /**
   * Ingest one tick from a shard.
   *
   * Fails with `TickMappingNotFound` when the coin has no mapping on the
   * exchange; every other outcome is a recorded side update or a skipped thin
   * book.
   */
  readonly ingest: (tick: CanonicalTick, context: TickContext) => Effect.Effect<void, TickMappingNotFound>
}>()("lister/crawler/TickIngestion") {
  /**
   * Layer wiring the pipeline to its persistence and rate ports.
   */
  static readonly layer: Layer.Layer<
    TickIngestion,
    never,
    MarketMappings | OpportunityWriter | IdrRate
  > = Layer.effect(
    TickIngestion,
    Effect.gen(function*() {
      const mappings = yield* MarketMappings
      const writer = yield* OpportunityWriter
      const rate = yield* IdrRate

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

          const quote = processTick(tick, ref.value.quoteCurrency, yield* rate.current)

          if (quote === null) {
            yield* Effect.logDebug(`thin book skipped ${tick.symbol}`)

            return
          }

          const base = {
            cryptocurrencyId: ref.value.cryptocurrencyId,
            exchangeId: context.exchangeId,
            tickTimestamp: tick.timestamp
          }

          yield* writer.recordBuy({
            ...base,
            price: quote.buyPrice,
            volume: quote.buyVolume
          })

          yield* writer.recordSell({
            ...base,
            price: quote.sellPrice,
            volume: quote.sellVolume
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
