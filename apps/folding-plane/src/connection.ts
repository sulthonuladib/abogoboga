import { Schema } from 'effect'
import { defineTaggedUnion } from 'foldkit/schema'

// SOCKET

/**
 * The event socket's lifecycle as the root sees it. `Disconnected` is the
 * socket released, `Connecting` is acquisition or re-acquisition in flight,
 * `Connected` is an open socket, and `Error` is the last acquisition failure.
 */
export const ConnectionState = defineTaggedUnion({
  Disconnected: {},
  Connecting: {},
  Connected: {},
  Error: { detail: Schema.String },
})

export type ConnectionState = typeof ConnectionState.Type
