import { Array, DateTime, Option, String } from 'effect'

// COUNT

const pending = '…'

/**
 * A count an operator can scan at a glance, and the placeholder a figure shows
 * until it has loaded.
 */
export const formatCount = (value: number): string =>
  globalThis.Number.isFinite(value) ? value.toLocaleString('en-US') : pending

export const pendingCount = pending

// DATE

const monthNames = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const

/**
 * The date part of a timestamp, without the clock. A column of timestamps
 * should differ where they differ and read alike where they do not.
 */
export const formatDate = (at: DateTime.Utc): string => {
  const date = DateTime.toDateUtc(at)

  if (globalThis.Number.isNaN(date.getTime())) {
    return ''
  }

  return Option.match(Array.get(monthNames, date.getUTCMonth()), {
    onNone: () => '',
    onSome: (name) => `${name} ${date.getUTCDate()}, ${date.getUTCFullYear()}`,
  })
}

// AGO

const second = 1
const minute = 60
const hour = 3600
const day = 86400
const month = day * 30

type AgoUnit = Readonly<{ limit: number, seconds: number, suffix: string }>

const agoUnits: ReadonlyArray<AgoUnit> = [
  { limit: minute, seconds: second, suffix: 's' },
  { limit: hour, seconds: minute, suffix: 'm' },
  { limit: day, seconds: hour, suffix: 'h' },
  { limit: month, seconds: day, suffix: 'd' },
]

const agoFor = (elapsed: number): string =>
  Option.match(Array.findLast(agoUnits, (unit) => elapsed >= unit.limit), {
    onNone: () => (elapsed <= second ? 'just now' : `${elapsed}s ago`),
    onSome: (unit) => `${Math.round(elapsed / unit.seconds)}${unit.suffix} ago`,
  })

/**
 * How long ago a moment in epoch milliseconds was, in the largest unit that
 * still reads as a whole number.
 */
export const formatAgo = (at: number, now: number): string =>
  agoFor(Math.max(0, Math.round((now - at) / 1000)))

// TEXT

export const isFilled = (value: string): boolean => String.isNonEmpty(value.trim())

/**
 * The value a text input writes: trimmed, or the empty string when nothing was
 * typed. Every request sends this rather than the raw keystrokes.
 */
export const trimmedOrEmpty = (value: string): string => (isFilled(value) ? value.trim() : '')
