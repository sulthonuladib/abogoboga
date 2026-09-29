# Opportunity matrix

The `opportunity` table is the read model the frontend will use to show
cross-exchange arbitrage. It has no REST surface yet; this note describes the
table so the future endpoint (and any direct read) can be shaped around it.

## What one row means

One row is a transferable route for one coin between two exchanges:

- `cryptocurrencyId` — the coin, a foreign key to `cryptocurrency`.
- `buyExchangeId` — the exchange the coin is bought on and withdrawn from.
- `sellExchangeId` — the exchange the coin is sold on and deposited to.
- The triple `(cryptocurrencyId, buyExchangeId, sellExchangeId)` is unique.

No chain id is stored: a row says "a viable route exists", not which chain
carries it. Both ordered directions are separate rows, so BTC across two open
exchanges normally yields `(A, B)` and `(B, A)`. A coin whose deposits are
closed on `B` yields only `(B, A)`.

## Columns

| Column | Type | Meaning |
| --- | --- | --- |
| `id` | identity | Primary key. |
| `cryptocurrencyId` | integer | Coin (FK, cascade). |
| `buyExchangeId` | integer | Buy/withdraw exchange (FK, cascade). |
| `sellExchangeId` | integer | Sell/deposit exchange (FK, cascade). |
| `buyPrice` | double precision | Marginal ask price in IDR at the volume target, or `0` before the first tick. |
| `sellPrice` | double precision | Marginal bid price in IDR at the volume target, or `0`. |
| `buyVolume` | double precision | Base amount bought to reach the 2,000,000 IDR target. |
| `sellVolume` | double precision | Base amount sold to reach the target. |
| `buyTickTimestamp` | bigint | Epoch-millisecond timestamp of the buy-side tick. |
| `sellTickTimestamp` | bigint | Epoch-millisecond timestamp of the sell-side tick. |
| `createdAt` / `updatedAt` | timestamp | Row bookkeeping. |

## How rows are created and updated

- A route scan from database truth (coin listed and trade-enabled on both
  sides, and a chain where the buy side can withdraw and the sell side can
  deposit) computes the desired row set. Missing rows are inserted at zero
  price/volume and vanished routes are deleted; rows that already carry prices
  are left untouched. The scan re-runs when the active exchange set changes and
  when coin detail changes.
- A tick resolves the coin mapping and the current USDT→IDR rate, walks the
  book to the 2,000,000 IDR target, then writes the buy columns on every row
  whose `buyExchangeId` matches the tick's exchange and the sell columns on
  rows whose `sellExchangeId` matches. A tick for a coin with no rows is a
  no-op.

## Intended read path

A frontend read should return rows joined to `cryptocurrency` and both
`exchange` rows, filtered to `buyPrice > 0 AND sellPrice > 0` for executable
routes, and ordered by the spread (`sellPrice - buyPrice`). The matrix is
backend-owned for now; no endpoint exists in this change.
