/**
 * Tiny HTML templating helpers for the server-rendered control plane.
 *
 * Views are plain functions returning {@link RawHtml}; interpolated values are
 * escaped unless they are already {@link RawHtml}, so nested view output is
 * never double-escaped and untrusted input is always encoded.
 *
 * @module
 */

/**
 * HTML source whose escaping has already been established.
 *
 * Instances are produced by {@link raw} (already-safe markup) and by the
 * {@link html} tagged template (escaped interpolations). Interpolating a
 * `RawHtml` into another template inserts it verbatim.
 */
export class RawHtml {
  /** Rendered markup. */
  readonly value: string

  constructor(value: string) {
    this.value = value
  }

  toString(): string {
    return this.value
  }
}

/**
 * Escapes `&`, `<`, `>`, `"`, and `'` so the value can be embedded in HTML text
 * or a quoted attribute.
 *
 * @param value - Untrusted text.
 * @returns The escaped text.
 */
export const escapeHtml = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")

const renderValue = (value: unknown): string => {
  if (value instanceof RawHtml) return value.value

  if (Array.isArray(value)) return value.map((item) => renderValue(item)).join("")

  if (value === undefined || value === null) return ""

  return escapeHtml(String(value))
}

/**
 * Renders a trusted HTML fragment verbatim.
 *
 * @param value - Markup that must not be escaped.
 * @returns The branded fragment.
 */
export const raw = (value: string): RawHtml => new RawHtml(value)

/**
 * Tagged template that escapes every interpolation.
 *
 * Arrays of strings and {@link RawHtml} are rendered by joining their items, so
 * `html` can inline lists without a separate helper.
 *
 * @param strings - Literal template chunks.
 * @param values - Interpolated values.
 * @returns The rendered fragment.
 */
export const html = (strings: TemplateStringsArray, ...values: ReadonlyArray<unknown>): RawHtml => {
  let output = strings[0] ?? ""

  for (const [index, value] of values.entries()) {
    output += renderValue(value) + (strings[index + 1] ?? "")
  }

  return raw(output)
}

/**
 * Joins rendered parts into one fragment.
 *
 * Strings are escaped; {@link RawHtml} parts are inserted verbatim.
 *
 * @param parts - Fragments or plain strings.
 * @returns The joined fragment.
 */
export const join = (parts: ReadonlyArray<RawHtml | string>): RawHtml =>
  raw(parts.map((part) => (part instanceof RawHtml ? part.value : escapeHtml(part))).join(""))
