/**
 * CoinGecko exchange-metadata scanner.
 *
 * Two phases keep API usage inside the Demo rate limit: {@link fetchSnapshot}
 * reads CoinGecko once and writes a versioned JSON snapshot, and
 * {@link importSnapshot} replays that snapshot into Postgres without touching
 * the network. Both phases are exposed through `lister scan`.
 *
 * Every imported market is attached to a single operator-managed chain whose
 * code defaults to `UNMAPPED`, so the crawler has a chain route to work with
 * until real chains are curated.
 *
 * @module
 */

import {
  Database,
  chainTable,
  cryptocurrencyTable,
  exchangeCryptocurrencyChainTable,
  exchangeCryptocurrencyTable,
  exchangeTable
} from "@lister/db"
import { sql } from "drizzle-orm"
import { Clock, Duration, Effect, FileSystem, Schema } from "effect"
import {
  type BaseCurrency,
  CoinGecko,
  type CoinGeckoError,
  type CoinListItem,
  type TargetExchange,
  coinImageBatchSize,
  targetExchangeBySlug,
  targetExchanges
} from "./CoinGecko.ts"

/**
 * Default path the operator writes snapshots to and imports from.
 *
 * A `/tmp` path keeps a cron/subprocess invocation stateless between runs.
 */
export const defaultSnapshotPath = "/tmp/arbitrator-coingecko-snapshot.json" as const

/**
 * Default name of the operator-managed fallback chain.
 */
export const defaultUnmappedChainName = "Unmapped" as const

/**
 * Default code of the operator-managed fallback chain.
 */
export const defaultUnmappedChainCode = "UNMAPPED" as const

/**
 * Number of tickers CoinGecko returns per page.
 */
export const tickerPageSize = 100 as const

/**
 * Safety bound on ticker pages per exchange, so a stuck cursor cannot loop.
 */
export const maxTickerPages = 300 as const

const boundedString = Schema.NonEmptyString.pipe(Schema.check(Schema.isMaxLength(255)))

/**
 * Maximum logo URL length. The database columns are `varchar(255)`, so a
 * longer vendor URL is dropped rather than stored truncated (a broken URL is
 * worse than none).
 */
const maxLogoLength = 255 as const

/**
 * Keep a logo URL only when it fits the database column.
 *
 * @param url - Vendor logo URL, possibly empty.
 * @returns The URL when it fits, otherwise an empty string.
 */
const boundedLogo = (url: string): string => (url.length <= maxLogoLength ? url : "")

const logo = Schema.String.pipe(Schema.check(Schema.isMaxLength(maxLogoLength)))

/**
 * One ticker retained in a snapshot.
 */
export const SnapshotTicker = Schema.Struct({
  base: boundedString,
  target: boundedString,
  coinId: boundedString,
  targetCoinId: Schema.String.pipe(Schema.check(Schema.isMaxLength(255)))
})

/**
 * One ticker retained in a snapshot.
 */
export type SnapshotTicker = typeof SnapshotTicker.Type

/**
 * One coin retained in a snapshot, including its platform contracts and logo.
 */
export const SnapshotCoin = Schema.Struct({
  id: boundedString,
  name: boundedString,
  symbol: boundedString,
  logo,
  platforms: Schema.Record(Schema.String, Schema.NullOr(Schema.String))
})

/**
 * One coin retained in a snapshot, including its platform contracts.
 */
export type SnapshotCoin = typeof SnapshotCoin.Type

/**
 * One exchange, its logo, and its page-collected tickers.
 */
export const SnapshotExchange = Schema.Struct({
  slug: boundedString,
  coingeckoId: boundedString,
  name: boundedString,
  logo,
  baseCurrency: Schema.Literals(["usdt", "idr"]),
  tickers: Schema.Array(SnapshotTicker)
})

/**
 * One exchange and its page-collected tickers.
 */
export type SnapshotExchange = typeof SnapshotExchange.Type

/**
 * Version tag of the snapshot format.
 */
export const snapshotVersion = 1 as const

/**
 * A complete, replayable CoinGecko snapshot.
 */
export const Snapshot = Schema.Struct({
  version: Schema.Literal(snapshotVersion),
  fetchedAt: Schema.String.pipe(Schema.check(Schema.isMaxLength(64))),
  exchanges: Schema.Array(SnapshotExchange),
  coins: Schema.Array(SnapshotCoin)
})

/**
 * A complete, replayable CoinGecko snapshot.
 */
export type Snapshot = typeof Snapshot.Type

const SnapshotJson = Schema.fromJsonString(Snapshot)

/**
 * Expected failure: a requested exchange slug is not a scanner target.
 */
export class UnknownTargetExchange extends Schema.TaggedError<UnknownTargetExchange>()("UnknownTargetExchange", {
  slug: Schema.NonEmptyString.pipe(Schema.check(Schema.isMaxLength(255)))
}) {}

/**
 * Expected failure reading or writing a snapshot file.
 */
export class SnapshotFileError extends Schema.TaggedError<SnapshotFileError>()("SnapshotFileError", {
  path: Schema.NonEmptyString.pipe(Schema.check(Schema.isMaxLength(1024))),
  operation: Schema.Literals(["read", "write"]),
  cause: Schema.Defect()
}) {}

/**
 * Expected failure decoding a snapshot file.
 */
export class SnapshotDecodeError extends Schema.TaggedError<SnapshotDecodeError>()("SnapshotDecodeError", {
  path: Schema.NonEmptyString.pipe(Schema.check(Schema.isMaxLength(1024))),
  detail: Schema.NonEmptyString.pipe(Schema.check(Schema.isMaxLength(2048))),
  cause: Schema.Defect()
}) {}

/**
 * Options accepted by {@link fetchSnapshot}.
 */
export type FetchSnapshotOptions = {
  /** Exchange slugs to fetch; an empty list means every target. */
  readonly exchanges: ReadonlyArray<string>
  /** Milliseconds to wait between ticker pages, to protect the rate limit. */
  readonly delayMillis: number
}

/**
 * Options accepted by {@link mapSnapshot} and {@link importSnapshot}.
 */
export type ImportSnapshotOptions = {
  /** Name written for the fallback chain. */
  readonly chainName: string
  /** Code written for the fallback chain and every chain link. */
  readonly chainCode: string
}

/**
 * Counts of rows written by {@link importSnapshot}.
 */
export interface ImportSummary {
  /** Cryptocurrencies upserted. */
  readonly cryptocurrencies: number
  /** Exchanges upserted. */
  readonly exchanges: number
  /** Market assignments upserted. */
  readonly markets: number
  /** Chain links upserted onto the fallback chain. */
  readonly chainLinks: number
}

/**
 * Resolve requested slugs to targets, rejecting unknown ones.
 *
 * @param slugs - Requested exchange slugs; empty selects every target.
 * @returns The matching targets in configuration order.
 */
export const resolveTargets = (
  slugs: ReadonlyArray<string>
): Effect.Effect<ReadonlyArray<TargetExchange>, UnknownTargetExchange> =>
  Effect.gen(function*() {
    if (slugs.length === 0) return targetExchanges

    const resolved: Array<TargetExchange> = []

    for (const slug of slugs) {
      const target = targetExchangeBySlug(slug)

      if (target === undefined) {
        return yield* new UnknownTargetExchange({ slug })
      }

      resolved.push(target)
    }

    return resolved
  })

/**
 * Fetch every target exchange's tickers and the referenced coins.
 *
 * Ticker pages are read sequentially in `base_target` order, deduplicating by
 * coin id, then `/coins/list` is read once and filtered to the coins that were
 * referenced. Requires {@link CoinGecko}.
 */
export const fetchSnapshot = Effect.fn("Scanner.fetchSnapshot")(function*(options: FetchSnapshotOptions) {
  const coingecko = yield* CoinGecko
  const targets = yield* resolveTargets(options.exchanges)
  const exchanges: Array<SnapshotExchange> = []
  const referenced = new Set<string>()
  let requests = 0

  // Pace every request (ticker pages and the coins list) so the scanner stays
  // under the Demo limit instead of bursting; the first request goes out
  // immediately.
  const paced = <A>(effect: Effect.Effect<A, CoinGeckoError>): Effect.Effect<A, CoinGeckoError> =>
    Effect.gen(function*() {
      if (requests > 0 && options.delayMillis > 0) {
        yield* Effect.sleep(Duration.millis(options.delayMillis))
      }

      requests += 1

      return yield* effect
    })

  for (const target of targets) {
    const byCoin = new Map<string, SnapshotTicker>()

    for (let page = 1; page <= maxTickerPages; page += 1) {
      const result = yield* paced(coingecko.exchangeTickers(target.coingeckoId, page))

      for (const ticker of result.tickers) {
        if (!byCoin.has(ticker.coinId)) {
          byCoin.set(ticker.coinId, {
            base: ticker.base,
            target: ticker.target,
            coinId: ticker.coinId,
            targetCoinId: ticker.targetCoinId
          })
          referenced.add(ticker.coinId)
        }
      }

      if (result.pageSize < tickerPageSize) break
    }

    const exchangeLogo = yield* paced(coingecko.exchangeLogo(target.coingeckoId, target.searchQuery))

    exchanges.push({
      slug: target.slug,
      coingeckoId: target.coingeckoId,
      name: target.name,
      logo: boundedLogo(exchangeLogo),
      baseCurrency: target.baseCurrency,
      tickers: [...byCoin.values()]
    })
  }

  const allCoins = yield* paced(coingecko.listCoins)

  const selected = allCoins.filter((coin) => referenced.has(coin.id) && coin.name !== "" && coin.symbol !== "")

  // CoinGecko has no bulk image endpoint, so resolve logos for the referenced
  // coins through `/coins/markets` in batches; misses keep an empty logo.
  const images = new Map<string, string>()

  for (let offset = 0; offset < selected.length; offset += coinImageBatchSize) {
    const batch = selected
      .slice(offset, offset + coinImageBatchSize)
      .map((coin) => coin.id)

    const found = yield* paced(coingecko.coinImages(batch))

    for (const [id, image] of found) {
      images.set(id, image)
    }
  }

  const coins = selected.map((coin: CoinListItem): SnapshotCoin => ({
    id: coin.id,
    name: coin.name,
    symbol: coin.symbol,
    logo: boundedLogo(images.get(coin.id) ?? ""),
    platforms: coin.platforms ?? {}
  }))

  const fetchedAt = new Date(yield* Clock.currentTimeMillis).toISOString()

  return { version: snapshotVersion, fetchedAt, exchanges, coins } satisfies Snapshot
})

/**
 * Write a snapshot as pretty JSON, creating no directories.
 *
 * @param path - Destination file path.
 * @param snapshot - Snapshot to serialize.
 * @returns The written path.
 */
export const writeSnapshot = Effect.fn("Scanner.writeSnapshot")(function*(path: string, snapshot: Snapshot) {
  const fileSystem = yield* FileSystem.FileSystem
  const encoded = yield* Schema.encodeEffect(Snapshot)(snapshot)
  const json = `${JSON.stringify(encoded, null, 2)}\n`

  yield* fileSystem.writeFileString(path, json).pipe(
    Effect.mapError(
      (cause) =>
        new SnapshotFileError({
          path,
          operation: "write",
          cause
        })
    )
  )

  return path
})

/**
 * Read and decode a snapshot file.
 *
 * @param path - Source file path.
 * @returns The decoded snapshot.
 */
export const readSnapshot = Effect.fn("Scanner.readSnapshot")(function*(path: string) {
  const fileSystem = yield* FileSystem.FileSystem

  const raw = yield* fileSystem.readFileString(path).pipe(
    Effect.mapError(
      (cause) =>
        new SnapshotFileError({
          path,
          operation: "read",
          cause
        })
    )
  )

  return yield* Schema.decodeEffect(SnapshotJson)(raw).pipe(
    Effect.mapError(
      (cause) =>
        new SnapshotDecodeError({
          path,
          detail: "Snapshot file is not a valid scanner snapshot",
          cause
        })
    )
  )
})

/**
 * Transaction rows derived from a snapshot, before database ids are known.
 */
export interface SnapshotImportPlan {
  /** The single fallback chain every market is attached to. */
  readonly chain: { readonly name: string; readonly code: string }
  /** Exchanges to upsert, keyed by slug. */
  readonly exchanges: ReadonlyArray<{
    readonly slug: string
    readonly coingeckoId: string
    readonly name: string
    readonly logo: string
    readonly baseCurrency: BaseCurrency
  }>
  /** Coins to upsert, keyed by CoinGecko id (also used as the slug). */
  readonly coins: ReadonlyArray<{
    readonly coingeckoId: string
    readonly name: string
    readonly symbol: string
    readonly slug: string
    readonly logo: string
  }>
  /** Exchange/coin assignments to upsert. */
  readonly markets: ReadonlyArray<{
    readonly exchangeSlug: string
    readonly coingeckoId: string
    readonly exchangeSymbol: string
  }>
}

/**
 * Map a snapshot onto the rows an import writes.
 *
 * Pure: no database or clock access, so the mapping is unit-testable. Coins
 * are deduplicated by CoinGecko id and use that id as their slug; every
 * exchange's tickers are already deduplicated by coin id at fetch time.
 *
 * @param snapshot - Parsed snapshot.
 * @param options - Fallback-chain name and code.
 * @returns The import plan.
 */
export const mapSnapshot = (snapshot: Snapshot, options: ImportSnapshotOptions): SnapshotImportPlan => {
  const coins = new Map<string, SnapshotImportPlan["coins"][number]>()

  for (const coin of snapshot.coins) {
    if (!coins.has(coin.id)) {
      coins.set(coin.id, {
        coingeckoId: coin.id,
        name: coin.name,
        symbol: coin.symbol,
        slug: coin.id,
        logo: coin.logo
      })
    }
  }

  const markets: Array<SnapshotImportPlan["markets"][number]> = []

  for (const exchange of snapshot.exchanges) {
    for (const ticker of exchange.tickers) {
      markets.push({
        exchangeSlug: exchange.slug,
        coingeckoId: ticker.coinId,
        exchangeSymbol: ticker.base
      })
    }
  }

  return {
    chain: { name: options.chainName, code: options.chainCode },
    exchanges: snapshot.exchanges.map((exchange) => ({
      slug: exchange.slug,
      coingeckoId: exchange.coingeckoId,
      name: exchange.name,
      logo: exchange.logo,
      baseCurrency: exchange.baseCurrency
    })),
    coins: [...coins.values()],
    markets
  }
}

/**
 * Replay a snapshot into Postgres in one transaction.
 *
 * The fallback chain is upserted first, then exchanges (by slug), coins (by
 * CoinGecko id), market assignments (by exchange/coin), and one chain link per
 * assignment (by assignment/chain). Re-running is idempotent.
 *
 * @param snapshot - Parsed snapshot.
 * @param options - Fallback-chain name and code.
 * @returns Row counts written.
 */
export const importSnapshot = Effect.fn("Scanner.importSnapshot")(function*(
  snapshot: Snapshot,
  options: ImportSnapshotOptions
) {
  const plan = mapSnapshot(snapshot, options)
  const { db } = yield* Database

  return yield* db.transaction((tx) =>
    Effect.gen(function*() {
      const [chain] = yield* tx
        .insert(chainTable)
        .values(plan.chain)
        .onConflictDoUpdate({
          target: chainTable.code,
          set: { name: sql`excluded.name` }
        })
        .returning({ id: chainTable.id })

      if (chain === undefined) {
        return yield* Effect.die(new Error("chain upsert returned no row"))
      }

      const importedExchanges =
        plan.exchanges.length === 0
          ? []
          : yield* tx
              .insert(exchangeTable)
              .values([...plan.exchanges])
              .onConflictDoUpdate({
                target: exchangeTable.slug,
                set: {
                  coingeckoId: sql`excluded."coingeckoId"`,
                  name: sql`excluded.name`,
                  logo: sql`excluded.logo`,
                  baseCurrency: sql`excluded."baseCurrency"`
                }
              })
              .returning({ id: exchangeTable.id, slug: exchangeTable.slug })

      const importedCoins =
        plan.coins.length === 0
          ? []
          : yield* tx
              .insert(cryptocurrencyTable)
              .values([...plan.coins])
              .onConflictDoUpdate({
                target: cryptocurrencyTable.coingeckoId,
                set: {
                  name: sql`excluded.name`,
                  symbol: sql`excluded.symbol`,
                  slug: sql`excluded.slug`,
                  logo: sql`excluded.logo`
                }
              })
              .returning({ id: cryptocurrencyTable.id, coingeckoId: cryptocurrencyTable.coingeckoId })

      const exchangeIdBySlug = new Map(importedExchanges.map((row) => [row.slug, row.id]))
      const coinIdByCoingeckoId = new Map(importedCoins.map((row) => [row.coingeckoId, row.id]))

      const marketRows = plan.markets.flatMap((market) => {
        const exchangeId = exchangeIdBySlug.get(market.exchangeSlug)
        const cryptocurrencyId = coinIdByCoingeckoId.get(market.coingeckoId)

        return exchangeId === undefined || cryptocurrencyId === undefined
          ? []
          : [
              {
                exchangeId,
                cryptocurrencyId,
                exchangeSymbol: market.exchangeSymbol,
                listed: true,
                tradeEnabled: true
              }
            ]
      })

      const importedMarkets =
        marketRows.length === 0
          ? []
          : yield* tx
              .insert(exchangeCryptocurrencyTable)
              .values(marketRows)
              .onConflictDoUpdate({
                target: [exchangeCryptocurrencyTable.exchangeId, exchangeCryptocurrencyTable.cryptocurrencyId],
                set: {
                  exchangeSymbol: sql`excluded."exchangeSymbol"`,
                  listed: true,
                  tradeEnabled: true
                }
              })
              .returning({ id: exchangeCryptocurrencyTable.id })

      const linkRows = importedMarkets.map((market) => ({
        exchangeCryptocurrencyId: market.id,
        chainId: chain.id,
        exchangeChainCode: options.chainCode,
        exchangeChainName: options.chainName,
        withdrawEnabled: true,
        depositEnabled: true
      }))

      if (linkRows.length > 0) {
        yield* tx
          .insert(exchangeCryptocurrencyChainTable)
          .values(linkRows)
          .onConflictDoUpdate({
            target: [
              exchangeCryptocurrencyChainTable.exchangeCryptocurrencyId,
              exchangeCryptocurrencyChainTable.chainId
            ],
            set: {
              exchangeChainCode: sql`excluded."exchangeChainCode"`,
              exchangeChainName: sql`excluded."exchangeChainName"`,
              withdrawEnabled: true,
              depositEnabled: true
            }
          })
      }

      return {
        cryptocurrencies: importedCoins.length,
        exchanges: importedExchanges.length,
        markets: importedMarkets.length,
        chainLinks: linkRows.length
      }
    })
  )
})
