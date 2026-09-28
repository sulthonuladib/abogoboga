import { Option, Record, pipe } from 'effect'
import { Cookies } from 'effect/unstable/http'

import { Theme } from './model'

// COOKIE

/**
 * The theme travels in a cookie rather than in local storage, because the
 * server has to know it before it renders. A page that renders one theme and
 * hydrates into another would disagree with itself.
 */
export const THEME_COOKIE = 'lister-theme'

const oneYearInSeconds = 31536000

export const themeCookie = (theme: Theme): string =>
  `${THEME_COOKIE}=${theme}; path=/; max-age=${oneYearInSeconds}; samesite=lax`

const isTheme = (value: string): value is Theme =>
  Theme.literals.some((literal) => literal === value)

const fallbackTheme: Theme = 'Light'

export const themeFromCookieHeader = (cookieHeader: string): Theme =>
  pipe(
    Cookies.parseHeader(cookieHeader),
    Record.get(THEME_COOKIE),
    Option.filter(isTheme),
    Option.getOrElse(() => fallbackTheme),
  )
