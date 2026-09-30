import { describe, expect, test } from "bun:test"
import {
  Database,
  chainTable,
  cryptocurrencyTable,
  exchangeCryptocurrencyChainTable,
  exchangeCryptocurrencyTable,
  exchangeTable,
  opportunityTable
} from "@lister/db"
import { Duration, Effect, Layer, Ref, Scope, Stream } from "effect"
import { layer as eligibilityStoreLayer } from "./EligibilityStore.ts"
import { Gate } from "./Gate.ts"
import { OpportunityReconciler } from "./OpportunityReconciler.ts"
import { OpportunityStore, type OpportunityKey } from "./Opportunities.ts"
import { Eligibility } from "./Reconciler.ts"
import { opportunityStoreLayer } from "./OpportunityStore.ts"
import { DomainEvents } from "./WorkerEvents.ts"

const keyOf = (key: OpportunityKey): string => `${key.cryptocurrencyId}:${key.buyExchangeId}:${key.sellExchangeId}`

const a: OpportunityKey = { cryptocurrencyId: 1, buyExchangeId: 1, sellExchangeId: 2 }

const b: OpportunityKey = { cryptocurrencyId: 1, buyExchangeId: 2, sellExchangeId: 1 }

const c: OpportunityKey = { cryptocurrencyId: 2, buyExchangeId: 1, sellExchangeId: 2 }

interface FakeRow {
  readonly key: OpportunityKey
  readonly buyPrice: number
  readonly sellPrice: number
}

/**
 * In-memory {@link OpportunityStore} that mirrors the Drizzle adapter's diff
 * semantics so the reconciler's choice of keys can be asserted directly.
 */
const fakeStoreLayer = (rows: Ref.Ref<ReadonlyArray<FakeRow>>): Layer.Layer<OpportunityStore> =>
  Layer.succeed(
    OpportunityStore,
    OpportunityStore.of({
      diffInit: (desired) =>
        Effect.gen(function*() {
          const current = yield* Ref.get(rows)
          const desiredKeys = new Set(desired.map(keyOf))
          const kept = current.filter((row) => desiredKeys.has(keyOf(row.key)))
          const existing = new Set(kept.map((row) => keyOf(row.key)))

          const inserted = desired
            .filter((key) => !existing.has(keyOf(key)))
            .map((key): FakeRow => ({ key, buyPrice: 0, sellPrice: 0 }))

          yield* Ref.set(rows, [...kept, ...inserted])
        }),
      applySides: (write) =>
        Effect.gen(function*() {
          for (const update of write.buys) {
            yield* Ref.update(rows, (current) =>
              current.map((row) =>
                row.key.cryptocurrencyId === update.cryptocurrencyId && row.key.buyExchangeId === update.exchangeId
                  ? { ...row, buyPrice: update.price }
                  : row
              )
            )
          }

          for (const update of write.sells) {
            yield* Ref.update(rows, (current) =>
              current.map((row) =>
                row.key.cryptocurrencyId === update.cryptocurrencyId && row.key.sellExchangeId === update.exchangeId
                  ? { ...row, sellPrice: update.price }
                  : row
              )
            )
          }
        })
    })
  )

const fakeEligibilityLayer = (pairs: Ref.Ref<ReadonlyArray<OpportunityKey>>): Layer.Layer<Eligibility> =>
  Layer.succeed(
    Eligibility,
    Eligibility.of({
      exchangeSlug: () => Effect.succeedSome("fake-ex"),
      coinsForExchange: () => Effect.succeed([]),
      pairsFor: () => Ref.get(pairs)
    })
  )

const fakeGateLayer: Layer.Layer<Gate> = Layer.succeed(
  Gate,
  Gate.of({
    isDesired: () => Effect.succeed(true),
    active: Effect.succeed([1, 2]),
    start: () => Effect.void,
    stop: () => Effect.void
  })
)

const runWithReconciler = <A, E>(
  pairs: Ref.Ref<ReadonlyArray<OpportunityKey>>,
  rows: Ref.Ref<ReadonlyArray<FakeRow>>,
  program: Effect.Effect<A, E, OpportunityReconciler | DomainEvents | OpportunityStore | Scope.Scope>
): Promise<A> => {
  const dependencies = Layer.mergeAll(
    DomainEvents.layer,
    fakeEligibilityLayer(pairs),
    fakeGateLayer,
    fakeStoreLayer(rows)
  )

  const full = OpportunityReconciler.layer.pipe(Layer.provideMerge(dependencies))

  return Effect.runPromise(Effect.scoped(program.pipe(Effect.provide(full))))
}

const keysOf = (rows: ReadonlyArray<FakeRow>): ReadonlyArray<string> => rows.map((row) => keyOf(row.key)).sort()

describe("OpportunityReconciler", () => {
  test("inserts only new pairs when a third route appears and preserves live prices", async () => {
    const pairs = Ref.makeUnsafe<ReadonlyArray<OpportunityKey>>([a, b])
    const rows = Ref.makeUnsafe<ReadonlyArray<FakeRow>>([])

    const result = await runWithReconciler(
      pairs,
      rows,
      Effect.gen(function*() {
        const reconciler = yield* OpportunityReconciler
        const store = yield* OpportunityStore

        yield* reconciler.reconcile

        const afterFirst = yield* Ref.get(rows)

        // A tick writes a live price.
        yield* store.applySides({
          buys: [{
            cryptocurrencyId: a.cryptocurrencyId,
            exchangeId: a.buyExchangeId,
            price: 1_000_000,
            volume: 2,
            tickTimestamp: 1
          }],
          sells: []
        })

        const priced = yield* Ref.get(rows)

        // A third route appears.
        yield* Ref.set(pairs, [a, b, c])
        yield* reconciler.reconcile

        return { afterFirst, priced, afterThird: yield* Ref.get(rows) }
      })
    )

    expect(keysOf(result.afterFirst)).toEqual([keyOf(a), keyOf(b)].sort())
    expect(result.afterFirst.every((row) => row.buyPrice === 0)).toBe(true)

    expect(result.priced.find((row) => keyOf(row.key) === keyOf(a))?.buyPrice).toBe(1_000_000)

    expect(keysOf(result.afterThird)).toEqual([keyOf(a), keyOf(b), keyOf(c)].sort())

    const pricedAfterThird = result.afterThird.find((row) => keyOf(row.key) === keyOf(a))

    expect(pricedAfterThird?.buyPrice).toBe(1_000_000)
    expect(result.afterThird.find((row) => keyOf(row.key) === keyOf(c))?.buyPrice).toBe(0)
  })

  test("deletes rows for a lost route while the reverse survives, on a coin-detail change", async () => {
    const pairs = Ref.makeUnsafe<ReadonlyArray<OpportunityKey>>([a, b])
    const rows = Ref.makeUnsafe<ReadonlyArray<FakeRow>>([])

    const result = await runWithReconciler(
      pairs,
      rows,
      Effect.gen(function*() {
        const reconciler = yield* OpportunityReconciler
        const events = yield* DomainEvents

        yield* reconciler.reconcile

        yield* Effect.forkScoped(events.subscribe.pipe(Stream.runDrain))
        yield* Effect.sleep(Duration.millis(20))

        yield* Ref.set(pairs, [b])
        yield* events.publish({
          type: "coin-detail-changed",
          exchangeId: 1,
          exchangeCryptocurrencyId: 10,
          cryptocurrencyId: 1
        })

        for (let attempt = 0; attempt < 200; attempt++) {
          const current = yield* Ref.get(rows)

          if (current.length === 1) return current

          yield* Effect.sleep(Duration.millis(20))
        }

        return yield* Effect.die(new Error("timed out waiting for route deletion"))
      })
    )

    expect(keysOf(result)).toEqual([keyOf(b)])
  })
})

describe("OpportunityReconciler integration", () => {
  test("two exchanges with a shared BTC route produce both ordered rows", async () => {
    const database = Database.layerMemory()

    const seed = Effect.gen(function*() {
      const { db } = yield* Database

      const [buy] = yield* db
        .insert(exchangeTable)
        .values({ coingeckoId: "buy-ex", name: "Buy", slug: "buy-ex", logo: "buy.svg", baseCurrency: "idr" })
        .returning()

      const [sell] = yield* db
        .insert(exchangeTable)
        .values({ coingeckoId: "sell-ex", name: "Sell", slug: "sell-ex", logo: "sell.svg", baseCurrency: "usdt" })
        .returning()

      const [coin] = yield* db
        .insert(cryptocurrencyTable)
        .values({ coingeckoId: "bitcoin", name: "Bitcoin", symbol: "BTC", slug: "bitcoin", logo: "bitcoin.svg" })
        .returning()

      const [chain] = yield* db
        .insert(chainTable)
        .values({ name: "Ethereum", code: "ETH" })
        .returning()

      const [buyMapping] = yield* db
        .insert(exchangeCryptocurrencyTable)
        .values({ exchangeId: buy!.id, cryptocurrencyId: coin!.id, exchangeSymbol: "BTCIDR" })
        .returning()

      const [sellMapping] = yield* db
        .insert(exchangeCryptocurrencyTable)
        .values({ exchangeId: sell!.id, cryptocurrencyId: coin!.id, exchangeSymbol: "BTCUSDT" })
        .returning()

      for (const mapping of [buyMapping, sellMapping]) {
        yield* db.insert(exchangeCryptocurrencyChainTable).values({
          exchangeCryptocurrencyId: mapping!.id,
          chainId: chain!.id,
          exchangeChainCode: "ERC20",
          withdrawEnabled: true,
          depositEnabled: true
        })
      }

      return { buy: buy!.id, sell: sell!.id }
    })

    const program = Effect.gen(function*() {
      const { db } = yield* Database
      const reconciler = yield* OpportunityReconciler

      const ids = yield* seed

      yield* reconciler.reconcile

      const rows = yield* db.select().from(opportunityTable)

      return { ids, rows }
    })

    const stores = Layer.mergeAll(
      eligibilityStoreLayer.pipe(Layer.provide(database)),
      opportunityStoreLayer.pipe(Layer.provide(database))
    )

    const full = OpportunityReconciler.layer.pipe(
      Layer.provideMerge(Layer.mergeAll(database, DomainEvents.layer, fakeGateLayer, stores))
    )

    const result = await Effect.runPromise(Effect.scoped(program.pipe(Effect.provide(full))))

    expect(result.rows).toHaveLength(2)
    expect(result.rows.map((row) => `${row.buyExchangeId}->${row.sellExchangeId}`).sort()).toEqual(
      [`${result.ids.buy}->${result.ids.sell}`, `${result.ids.sell}->${result.ids.buy}`].sort()
    )
    expect(result.rows.every((row) => row.buyPrice === 0 && row.sellPrice === 0)).toBe(true)
  })
})
