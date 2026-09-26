import { HttpApi, OpenApi } from "effect/unstable/httpapi"
import { ChainApiGroup } from "./ChainApi.ts"
import { ChainLinkApiGroup } from "./ChainLinkApi.ts"
import { CryptocurrencyApiGroup } from "./CryptocurrencyApi.ts"
import { ExchangeApiGroup } from "./ExchangeApi.ts"
import { MarketApiGroup } from "./MarketApi.ts"
import { WorkersApiGroup } from "./WorkersApi.ts"

/**
 * Root HTTP API of the control plane.
 *
 * Groups are added here; each group's implementation is provided through its
 * own `HttpApiBuilder.group` layer.
 */
export class Api extends HttpApi.make("control-plane-api")
  .add(CryptocurrencyApiGroup)
  .add(ExchangeApiGroup)
  .add(ChainApiGroup)
  .add(MarketApiGroup)
  .add(ChainLinkApiGroup)
  .add(WorkersApiGroup)
  .annotateMerge(
    OpenApi.annotations({
      title: "Control plane API",
      version: "1.0.0",
      description: "Cryptocurrency, exchange, chain, and worker control-plane endpoints."
    })
  ) {}
