import { Menu } from '@foldkit/ui'

import type { Preset, Theme } from './model'

// THEME MENU

/**
 * The theme toggle, bound to the two themes. Declared once at module scope so
 * the view's item type and the OutMessage's value type cannot drift.
 */
export const ThemeMenu = Menu.create<Theme>()

export const themeItems: ReadonlyArray<Theme> = ['Light', 'Dark']

/**
 * The preset picker, bound to the named presets. One menu per concern rather
 * than a combined matrix: mode and preset vary independently, and each menu
 * reads as the single choice it is.
 */
export const PresetMenu = Menu.create<Preset>()

export const presetItems: ReadonlyArray<Preset> = [
  'Default',
  'Zinc',
  'Slate',
  'Stone',
  'Neutral',
  'Gray',
]
