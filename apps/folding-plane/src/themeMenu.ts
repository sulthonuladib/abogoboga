import { Menu } from '@foldkit/ui'

import type { Theme } from './model'

// THEME MENU

/**
 * The theme toggle, bound to the two themes. Declared once at module scope so
 * the view's item type and the OutMessage's value type cannot drift.
 */
export const ThemeMenu = Menu.create<Theme>()

export const themeItems: ReadonlyArray<Theme> = ['Light', 'Dark']
