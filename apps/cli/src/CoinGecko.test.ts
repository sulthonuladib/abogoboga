import { describe, expect, test } from "bun:test"
import { Effect } from "effect"
import { CoinGecko, CoinGeckoError, makeCoinGeckoLayer } from "./CoinGecko.ts"

/**
 * Response bodies the fake fetch returns: a coin list, a market/logo payload,
 * a rate-limit envelope, or an unexpected-shape probe.
 */
type FakeBody =
  | ReadonlyArray<{
      readonly id: string
      readonly name: string
      readonly symbol: string
      readonly platforms: Readonly<Record<string, string>>
    }>
  | ReadonlyArray<{ readonly id: string; readonly image: string }>
  | { readonly image: string }
  | { readonly exchanges: ReadonlyArray<{ readonly id: string; readonly large: string }> }
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

  test("keeps retrying a 429 until the rate-limit retry budget is exhausted", async () => {
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
    // One initial attempt plus the rate-limit retry budget.
    expect(calls).toBe(61)
  })

  test("gives up after the smaller retry budget for a server error", async () => {
    let calls = 0

    const fetch = async (): Promise<Response> => {
      calls += 1

      // `Retry-After` keeps the exponential backoff at zero so the test does not
      // actually sleep for the accumulated delay.
      return json({ status: { error_code: 500 } }, 500, { "retry-after": "0" })
    }

    const result = await Effect.runPromise(
      Effect.flip(readCoins.pipe(Effect.provide(makeCoinGeckoLayer({ fetch }))))
    )

    expect(result).toBeInstanceOf(CoinGeckoError)

    if (!(result instanceof CoinGeckoError)) throw new Error("expected CoinGeckoError")

    expect(result.status).toBe(500)
    expect(result.retryable).toBe(true)
    // Server errors keep the five-attempt budget, unlike rate limits.
    expect(calls).toBe(6)
  })
})

describe("CoinGecko logos", () => {
  test("resolves coin logos by id batch and an exchange large logo through search", async () => {
    const urls: Array<string> = []

    const fetch = async (input: string | URL | Request): Promise<Response> => {
      const url = input instanceof Request ? input.url : String(input)
      urls.push(url)

      if (url.includes("/coins/markets")) {
        return json(
          [
            { id: "bitcoin", image: "https://img.test/coins/images/1/large/bitcoin.png" },
            { id: "ethereum", image: "https://img.test/coins/images/279/large/ethereum.png" }
          ],
          200
        )
      }

      if (url.includes("/search")) {
        return json({ exchanges: [{ id: "binance", large: "https://img.test/markets/images/52/large/binance.png" }] }, 200)
      }

      return json([], 200)
    }

    const program = Effect.gen(function*() {
      const coinGecko = yield* CoinGecko

      return {
        images: yield* coinGecko.coinImages(["bitcoin", "ethereum"]),
        exchangeLogo: yield* coinGecko.exchangeLogo("binance", "Binance")
      }
    })

    const result = await Effect.runPromise(
      program.pipe(Effect.provide(makeCoinGeckoLayer({ fetch })))
    )

    expect(result.images.get("bitcoin")).toBe("https://img.test/coins/images/1/large/bitcoin.png")
    expect(result.images.get("ethereum")).toBe("https://img.test/coins/images/279/large/ethereum.png")
    expect(result.exchangeLogo).toBe("https://img.test/markets/images/52/large/binance.png")
    expect(urls.some((url) => url.includes("/coins/markets"))).toBe(true)
    expect(urls.some((url) => url.includes("ids=bitcoin"))).toBe(true)
    expect(urls.some((url) => url.includes("/search"))).toBe(true)
  })

  test("falls back to the exchange endpoint and upgrades small to large", async () => {
    const fetch = async (input: string | URL | Request): Promise<Response> => {
      const url = input instanceof Request ? input.url : String(input)

      if (url.includes("/search")) return json({ exchanges: [] }, 200)

      if (url.includes("/exchanges/")) {
        return json({ image: "https://img.test/markets/images/60/small/gate.png" }, 200)
      }

      return json([], 200)
    }

    const program = Effect.gen(function*() {
      const coinGecko = yield* CoinGecko

      return yield* coinGecko.exchangeLogo("gate", "Gate")
    })

    const result = await Effect.runPromise(
      program.pipe(Effect.provide(makeCoinGeckoLayer({ fetch })))
    )

    expect(result).toBe("https://img.test/markets/images/60/large/gate.png")
  })

  test("returns no images for an empty id batch without a request", async () => {
    let calls = 0

    const fetch = async (): Promise<Response> => {
      calls += 1

      return json([], 200)
    }

    const program = Effect.gen(function*() {
      const coinGecko = yield* CoinGecko

      return yield* coinGecko.coinImages([])
    })

    const result = await Effect.runPromise(
      program.pipe(Effect.provide(makeCoinGeckoLayer({ fetch })))
    )

    expect(result.size).toBe(0)
    expect(calls).toBe(0)
  })
})
