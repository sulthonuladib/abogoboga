import { DateTime } from "effect"

const countFormat = new Intl.NumberFormat("en-US")

const dateFormat = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC"
})

/**
 * Format an integer for display with thousands separators.
 *
 * @param value - Count to format.
 * @returns The formatted count.
 */
export const formatCount = (value: number): string => countFormat.format(value)

/**
 * Format a timestamp as UTC date and time.
 *
 * @param value - Timestamp to format.
 * @returns The formatted timestamp, or an em dash when absent.
 */
export const formatTimestamp = (value: DateTime.DateTime | null): string =>
  value === null ? "—" : dateFormat.format(new Date(DateTime.toEpochMillis(value)))

/**
 * Describe an epoch-millisecond timestamp relative to now.
 *
 * Monitoring cares about staleness, so ticks read as "just now", "4m ago",
 * or "3h ago" rather than an absolute clock time.
 *
 * @param epochMillis - Timestamp in epoch milliseconds.
 * @param now - Current time in epoch milliseconds.
 * @returns A relative description.
 */
export const formatAgo = (epochMillis: number | null, now: number): string => {
  if (epochMillis === null) return "never"

  const seconds = Math.max(0, Math.round((now - epochMillis) / 1000))

  if (seconds < 10) return "just now"

  if (seconds < 60) return `${seconds}s ago`

  const minutes = Math.round(seconds / 60)

  if (minutes < 60) return `${minutes}m ago`

  const hours = Math.round(minutes / 60)

  if (hours < 48) return `${hours}h ago`

  return `${Math.round(hours / 24)}d ago`
}

/**
 * Format a count with a singular or plural noun.
 *
 * @param count - Count to describe.
 * @param singular - Singular noun.
 * @param plural - Plural noun, defaulting to `singular + "s"`.
 * @returns The count and matching noun.
 */
export const pluralize = (count: number, singular: string, plural?: string): string =>
  `${formatCount(count)} ${count === 1 ? singular : plural ?? `${singular}s`}`
