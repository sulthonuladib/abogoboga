/**
 * Seed helpers for the SSR route tests.
 *
 * Rows are created through the real application services so tests never bypass
 * parsing, ports, or invariants.
 *
 * @module
 */

import {
  Chain,
  ChainLink,
  Cryptocurrency,
  Exchange,
  Market,
  type ChainCreate,
  type ChainLinkCreate,
  type CryptocurrencyCreate,
  type ExchangeCreate,
  type MarketCreate
} from "@lister/api"
import { Context, Effect } from "effect"
import type { AppService } from "./App.ts"

/** Creates an exchange through the application service. */
export const seedExchange = (services: Context.Context<AppService>, input: ExchangeCreate) =>
  Effect.gen(function*() {
    const exchanges = yield* Exchange

    return yield* exchanges.add(input)
  }).pipe(Effect.provide(services))

/** Creates a chain through the application service. */
export const seedChain = (services: Context.Context<AppService>, input: ChainCreate) =>
  Effect.gen(function*() {
    const chains = yield* Chain

    return yield* chains.add(input)
  }).pipe(Effect.provide(services))

/** Creates a cryptocurrency through the application service. */
export const seedCoin = (services: Context.Context<AppService>, input: CryptocurrencyCreate) =>
  Effect.gen(function*() {
    const cryptocurrency = yield* Cryptocurrency

    return yield* cryptocurrency.add(input)
  }).pipe(Effect.provide(services))

/** Assigns a market through the application service. */
export const seedMarket = (services: Context.Context<AppService>, input: MarketCreate) =>
  Effect.gen(function*() {
    const markets = yield* Market

    return yield* markets.assign(input)
  }).pipe(Effect.provide(services))

/** Creates a chain link through the application service. */
export const seedChainLink = (services: Context.Context<AppService>, input: ChainLinkCreate) =>
  Effect.gen(function*() {
    const links = yield* ChainLink

    return yield* links.add(input)
  }).pipe(Effect.provide(services))
