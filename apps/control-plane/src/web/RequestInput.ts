/**
 * Parsing helpers that turn HTTP query strings and form bodies into the values
 * the SSR routes and their application services expect.
 *
 * Each helper is total: absent or malformed input falls back to a documented
 * default, while branded identifiers that address a resource are decoded into a
 * precise `EntityMiss` so a bad path becomes a redirect rather than a crash.
 *
 * @module
 */

import { Effect, Option, Schema } from "effect"
import { HttpServerRequest } from "effect/unstable/http"
import { EntityMiss, type RouteError } from "./Http.ts"

/**
 * Single-valued request parameters.
 *
 * HTMX forms and query strings may repeat a key; the first value wins, matching
 * the legacy view behavior.
 */
export type Params = Readonly<Record<string, string>>

const firstValues = (entries: Iterable<[string, string]>) => {
  const out: Record<string, string> = {}

  for (const [key, value] of entries) {
    if (out[key] === undefined) out[key] = value
  }

  return out
}

/**
 * Reads the request query string into a single-valued record.
 *
 * @param request - Current server request.
 * @returns Query keys mapped to their first value.
 */
export const queryParams = (request: HttpServerRequest.HttpServerRequest): Params =>
  firstValues(new URL(request.originalUrl, "http://localhost").searchParams.entries())

/**
 * Reads a URL-encoded form body into a single-valued record.
 *
 * @param request - Current server request.
 * @returns The parsed form fields.
 */
export const formParams = (
  request: HttpServerRequest.HttpServerRequest
): Effect.Effect<Params, RouteError> =>
  request.text.pipe(
    Effect.map((body) => firstValues(new URLSearchParams(body).entries())),
    Effect.mapError((error): RouteError => error)
  )

/**
 * Reads a string field, falling back when the key is absent.
 *
 * @param params - Parsed parameters.
 * @param key - Field name.
 * @param fallback - Value used when the field is absent.
 * @returns The raw field value.
 */
export const text = (params: Params, key: string, fallback = ""): string => {
  const value = params[key]

  return value === undefined ? fallback : value
}

/**
 * Reads a string field and trims surrounding whitespace.
 *
 * @param params - Parsed parameters.
 * @param key - Field name.
 * @param fallback - Value used when the field is absent.
 * @returns The trimmed field value.
 */
export const trimmed = (params: Params, key: string, fallback = ""): string => text(params, key, fallback).trim()

/**
 * Reads an integer field, falling back when the field is absent or not a safe
 * integer.
 *
 * @param params - Parsed parameters.
 * @param key - Field name.
 * @param fallback - Value used when the field is absent or malformed.
 * @returns The parsed integer or the fallback.
 */
export const integer = (params: Params, key: string, fallback: number): number => {
  const raw = params[key]

  if (raw === undefined || raw === "") return fallback

  const parsed = Number(raw)

  return Number.isSafeInteger(parsed) ? parsed : fallback
}

/**
 * Reads a checkbox field.
 *
 * Checked checkboxes submit `on`; hidden inputs may send `true` or `1`.
 *
 * @param params - Parsed parameters.
 * @param key - Field name.
 * @returns Whether the box was checked.
 */
export const checkbox = (params: Params, key: string): boolean => {
  const raw = params[key]

  return raw === "on" || raw === "true" || raw === "1"
}

/**
 * Reads a field whose value must be one of a fixed set of literals.
 *
 * @template Allowed - The allowed literal union.
 * @param params - Parsed parameters.
 * @param key - Field name.
 * @param allowed - The allowed values.
 * @param fallback - Value used when the field is absent or unrecognized.
 * @returns The matched literal or the fallback.
 */
export const oneOf = <const Allowed extends ReadonlyArray<string>>(
  params: Params,
  key: string,
  allowed: Allowed,
  fallback: Allowed[number]
): Allowed[number] => {
  const raw = params[key]

  if (raw !== undefined) {
    for (const candidate of allowed) {
      if (candidate === raw) return candidate
    }
  }

  return fallback
}

/**
 * Decodes a required branded identifier from a path parameter.
 *
 * @template A - The branded identifier type.
 * @param raw - Raw path value.
 * @param schema - Branded id schema.
 * @param kind - Entity kind reported when the value is missing or invalid.
 * @returns The decoded id or an `EntityMiss`.
 */
export const decodeId = <A>(
  raw: string | undefined,
  schema: Schema.ConstraintDecoder<A>,
  kind: string
): Effect.Effect<A, EntityMiss> =>
  Effect.gen(function*() {
    if (raw === undefined || raw === "") {
      return yield* new EntityMiss({ kind, id: raw ?? "" })
    }

    const numeric = Number(raw)

    if (!Number.isSafeInteger(numeric)) {
      return yield* new EntityMiss({ kind, id: raw })
    }

    const decoded = Schema.decodeOption(schema)(numeric)

    if (Option.isNone(decoded)) {
      return yield* new EntityMiss({ kind, id: raw })
    }

    return decoded.value
  })

/**
 * Decodes an optional branded identifier from a form or query field.
 *
 * Invalid values are treated as absent, so an empty filter select never fails a
 * request.
 *
 * @template A - The branded identifier type.
 * @param raw - Raw field value.
 * @param schema - Branded id schema.
 * @returns The decoded id or `undefined`.
 */
export const optionalId = <A>(raw: string, schema: Schema.ConstraintDecoder<A>): A | undefined => {
  if (raw === "") return undefined

  const numeric = Number(raw)

  if (!Number.isSafeInteger(numeric)) return undefined

  const decoded = Schema.decodeOption(schema)(numeric)

  return Option.isNone(decoded) ? undefined : decoded.value
}

/**
 * Builds a URL-safe slug from arbitrary text.
 *
 * @param value - Source text.
 * @returns The lowercased, hyphen-separated slug with edge hyphens removed.
 */
export const slugify = (value: string): string =>
  value
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/^-+|-+$/g, "")
