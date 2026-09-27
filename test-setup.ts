/**
 * Root test preload, loaded before every `bun test` file via `bunfig.toml`.
 *
 * `packages/ui` registers happy-dom globally, which replaces the runtime's
 * `AbortSignal` with its own implementation. Later files in the same process
 * (notably `apps/cli`, whose file reads go through Effect's `FileSystem`)
 * then fail with `The "signal" argument must be of type AbortSignal`.
 *
 * The root `test` script also passes `--isolate` so each file gets a fresh
 * global, but a bare `bun test ./packages/ui ./apps/cli` shares one process
 * and one module registry across workspaces. Wrapping happy-dom's class does
 * not work there because the preload and the UI test resolve different copies
 * of the registrator module, so this instead intercepts the global definition
 * itself: attempts to redefine the pinned abort globals are ignored, keeping
 * the runtime's implementation while DOM tests keep `document`/`window`.
 *
 * @module
 */
const originalDefineProperty = Object.defineProperty

const definePinnedGuard: typeof Object.defineProperty = (target, propertyKey, attributes) => {
  if (target === globalThis && (propertyKey === "AbortSignal" || propertyKey === "AbortController")) {
    return target
  }

  return originalDefineProperty(target, propertyKey, attributes)
}

Object.defineProperty = definePinnedGuard
