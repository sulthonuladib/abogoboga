import { Context, Effect, Layer } from "effect"

/**
 * USDT→IDR conversion rate port.
 *
 * The rate is read per ingested tick for now; a later Redis-backed layer can
 * read the Indodax USDT/IDR last price without changing callers. Keeping the
 * conversion behind this port means the swap is one layer.
 */
export class IdrRate extends Context.Service<IdrRate, {
  /** Current USDT price in IDR. */
  readonly current: Effect.Effect<number>
}>()("lister/crawler/IdrRate") {
  /**
   * Constant-backed layer used until a live rate source exists.
   *
   * @param rate - The fixed USDT→IDR rate to report.
   * @returns A layer reporting the constant rate.
   */
  static readonly constantLayer = (rate: number = 17_976): Layer.Layer<IdrRate> =>
    Layer.succeed(
      IdrRate,
      IdrRate.of({ current: Effect.succeed(rate) })
    )
}
