import { Option, Schema } from "effect"
import { BootstrapCoin } from "./BootstrapCoin.ts"

/**
 * Subscribe command sent on worker stdin with a non-empty coin list.
 */
export const SubscribeCommand = Schema.Struct({
  type: Schema.Literal("subscribe"),
  coins: Schema.NonEmptyArray(BootstrapCoin)
})

/**
 * Subscribe command sent on worker stdin with a non-empty coin list.
 */
export type SubscribeCommand = typeof SubscribeCommand.Type

/**
 * Unsubscribe command sent on worker stdin with a non-empty coin list.
 */
export const UnsubscribeCommand = Schema.Struct({
  type: Schema.Literal("unsubscribe"),
  coins: Schema.NonEmptyArray(BootstrapCoin)
})

/**
 * Unsubscribe command sent on worker stdin with a non-empty coin list.
 */
export type UnsubscribeCommand = typeof UnsubscribeCommand.Type

/**
 * Either stdin command a worker accepts.
 */
export const WorkerCommand = Schema.Union([SubscribeCommand, UnsubscribeCommand])

/**
 * Either stdin command a worker accepts.
 */
export type WorkerCommand = typeof WorkerCommand.Type

/**
 * Decode one stdin line into a worker command.
 *
 * Blank lines, invalid JSON, unknown command types, empty coin lists, and
 * invalid coins all decode to `null`; callers log-and-ignore them without
 * affecting other subscriptions.
 *
 * @param line - The raw stdin line.
 * @returns The parsed command, or `null` when the line must be ignored.
 */
export const decodeCommandLine = (line: string): WorkerCommand | null => {
  const trimmed = line.trim()

  if (trimmed === "") {
    return null
  }

  let raw: unknown

  try {
    raw = JSON.parse(trimmed)
  } catch {
    return null
  }

  return Option.getOrNull(Schema.decodeUnknownOption(WorkerCommand)(raw))
}

/**
 * Encode a worker command as one stdin line.
 *
 * @param command - The command to encode.
 * @returns The newline-delimited JSON representation (without the newline).
 */
export const encodeCommandLine = (command: WorkerCommand): string =>
  JSON.stringify(Schema.encodeSync(WorkerCommand)(command))
