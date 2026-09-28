import { useEffect, useState } from "react"

/**
 * Debounce a value by a fixed delay.
 *
 * Search fields use this so typing does not fire a request per keystroke; the
 * atom runtime then caches each distinct query.
 *
 * @template T - Value type.
 * @param value - Value to debounce.
 * @param delayMs - Delay in milliseconds.
 * @returns The debounced value.
 */
export const useDebouncedValue = <T>(value: T, delayMs: number): T => {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs)

    return () => clearTimeout(timer)
  }, [value, delayMs])

  return debounced
}
