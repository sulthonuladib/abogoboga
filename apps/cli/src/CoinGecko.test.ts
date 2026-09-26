import { describe, expect, test } from "bun:test"
import { Effect } from "effect"
import { CoinGecko, CoinGeckoError, makeCoinGeckoLayer } from "./CoinGecko.ts"

/**
 * Response bodies the fake fetch returns: a coin list, a rate-limit envelope,
 * or an unexpected-shape probe.
 */
type FakeBody =
  | ReadonlyArray<{
      readonly id: string
      readonly name: string
      readonly symbol: string
      readonly platforms: Readonly<Record<string, string>>
    }>
  | { readonly status: { readonly error_code: number; readonly error_message?: string } }
  | { readonly unexpected: true }

const json = (
  body: FakeBody,
  status: number,
  headers: Record<string, string> = {}
): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers }
  })

const coinList = [{ id: "bitcoin", name: "Bitcoin", symbol: "btc", platforms: {} }]

const readCoins = Effect.gen(function*() {
  const coinGecko = yield* CoinGecko

  return yield* coinGecko.listCoins
})

describe("CoinGecko rate-limit handling", () => {
  test("retries a 429 and honors Retry-After", async () => {
    let calls = 0

    const fetch = async (): Promise<Response> => {
      calls += 1

      if (calls === 1) {
        return json({ status: { error_code: 429, error_message: "rate limited" } }, 429, { "retry-after": "0" })
      }

      return json(coinList, 200)
    }

    const result = await Effect.runPromise(
      readCoins.pipe(Effect.provide(makeCoinGeckoLayer({ fetch })))
    )

    expect(calls).toBe(2)
    expect(result.map((coin) => coin.id)).toEqual(["bitcoin"])
  })

  test("does not retry a response-shape failure", async () => {
    let calls = 0

    const fetch = async (): Promise<Response> => {
      calls += 1

      return json({ unexpected: true }, 200)
    }

    const result = await Effect.runPromise(
      Effect.flip(readCoins.pipe(Effect.provide(makeCoinGeckoLayer({ fetch }))))
    )

    expect(result).toBeInstanceOf(CoinGeckoError)

    if (!(result instanceof CoinGeckoError)) throw new Error("expected CoinGeckoError")

    expect(result.retryable).toBe(false)
    expect(calls).toBe(1)
  })

  test("gives up after the retry budget and surfaces the last rate-limit error", async () => {
    let calls = 0

    const fetch = async (): Promise<Response> => {
      calls += 1

      return json({ status: { error_code: 429 } }, 429, { "retry-after": "0" })
    }

    const result = await Effect.runPromise(
      Effect.flip(readCoins.pipe(Effect.provide(makeCoinGeckoLayer({ fetch }))))
    )

    expect(result).toBeInstanceOf(CoinGeckoError)

    if (!(result instanceof CoinGeckoError)) throw new Error("expected CoinGeckoError")

    expect(result.status).toBe(429)
    expect(result.retryable).toBe(true)
    // One initial attempt plus the retry budget.
    expect(calls).toBe(6)
  })
})
