import { Schema } from "effect"
import { BootstrapCoin } from "./BootstrapCoin.ts"

/**
 * Worker bootstrap identity carried in the RPC worker initial message.
 *
 * `exchangeSlug`/`shardId` identify the worker; `coins` is the initial
 * subscription set the worker subscribes to at boot.
 */
export const BootstrapContext = Schema.Struct({
  exchangeSlug: Schema.NonEmptyString.pipe(Schema.check(Schema.isMaxLength(255))),
  shardId: Schema.NonEmptyString.pipe(Schema.check(Schema.isMaxLength(64))),
  coins: Schema.Array(BootstrapCoin)
})

/**
 * Worker bootstrap identity carried in the RPC worker initial message.
 */
export type BootstrapContext = typeof BootstrapContext.Type
