import { HttpApi, OpenApi } from "effect/unstable/httpapi"
import { CryptocurrencyApiGroup } from "./CryptocurrencyApi.ts"

/**
 * Root HTTP API of the control plane.
 *
 * Groups are added here; each group's implementation is provided through its
 * own `HttpApiBuilder.group` layer.
 */
export class Api extends HttpApi.make("control-plane-api")
  .add(CryptocurrencyApiGroup)
  .annotateMerge(
    OpenApi.annotations({
      title: "Control plane API",
      version: "1.0.0",
      description: "Cryptocurrency, exchange, chain, and worker control-plane endpoints."
    })
  ) {}
