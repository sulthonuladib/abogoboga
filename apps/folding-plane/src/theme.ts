import { Option, Record, pipe } from 'effect'
import { Cookies } from 'effect/unstable/http'

import { Preset, Theme } from './model'

// COOKIE

/**
 * The theme travels in a cookie rather than in local storage, because the
 * server has to know it before it renders. A page that renders one theme and
 * hydrates into another would disagree with itself.
 */
export const THEME_COOKIE = 'lister-theme'

/**
 * The preset travels beside the theme for the same reason: the server has
 * to know it before it renders, or a cold load would flash the default
 * preset before hydrating into the stored one.
 */
export const PRESET_COOKIE = 'lister-preset'

const oneYearInSeconds = 31536000

export const themeCookie = (theme: Theme): string =>
  `${THEME_COOKIE}=${theme}; path=/; max-age=${oneYearInSeconds}; samesite=lax`

export const presetCookie = (preset: Preset): string =>
  `${PRESET_COOKIE}=${preset}; path=/; max-age=${oneYearInSeconds}; samesite=lax`

const isTheme = (value: string): value is Theme =>
  Theme.literals.some((literal) => literal === value)

const isPreset = (value: string): value is Preset =>
  Preset.literals.some((literal) => literal === value)

const fallbackTheme: Theme = 'Light'

const fallbackPreset: Preset = 'Default'

export const themeFromCookieHeader = (cookieHeader: string): Theme =>
  pipe(
    Cookies.parseHeader(cookieHeader),
    Record.get(THEME_COOKIE),
    Option.filter(isTheme),
    Option.getOrElse(() => fallbackTheme),
  )

export const presetFromCookieHeader = (cookieHeader: string): Preset =>
  pipe(
    Cookies.parseHeader(cookieHeader),
    Record.get(PRESET_COOKIE),
    Option.filter(isPreset),
    Option.getOrElse(() => fallbackPreset),
  )
