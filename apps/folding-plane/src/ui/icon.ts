import { type Html, type HtmlBuilder } from 'foldkit/html'

import { classNames } from './classNames'

// ICON

type Mark = Readonly<{ path: string }>

const marks = {
  gauge: [{ path: 'M12 14l4-4' }, { path: 'M4 18a8 8 0 1116 0' }],
  coin: [
    { path: 'M12 6v12' },
    { path: 'M15 9.5c0-1.4-1.3-2.5-3-2.5S9 8.1 9 9.5s1.3 2.2 3 2.5 3 1.1 3 2.5-1.3 2.5-3 2.5-3-1.1-3-2.5' },
  ],
  exchange: [{ path: 'M7 7h11l-3-3' }, { path: 'M17 17H6l3 3' }],
  chain: [
    { path: 'M9.5 14.5l5-5' },
    { path: 'M11 6.5l1.2-1.2a3.5 3.5 0 015 5L16 11.5' },
    { path: 'M13 17.5l-1.2 1.2a3.5 3.5 0 01-5-5L8 12.5' },
  ],
  pulse: [{ path: 'M3 12h4l2-6 4 12 2-6h6' }],
  plus: [{ path: 'M12 5v14' }, { path: 'M5 12h14' }],
  pencil: [{ path: 'M4 20h4l10-10-4-4L4 16v4z' }],
  trash: [
    { path: 'M4 7h16' },
    { path: 'M9 7V5h6v2' },
    { path: 'M6 7l1 13h10l1-13' },
  ],
  play: [{ path: 'M8 5l11 7-11 7V5z' }],
  stop: [{ path: 'M7 7h10v10H7z' }],
  refresh: [{ path: 'M20 12a8 8 0 11-2.3-5.7' }, { path: 'M20 4v4h-4' }],
  chart: [
    { path: 'M4 19h16' },
    { path: 'M7 16V9' },
    { path: 'M12 16V5' },
    { path: 'M17 16v-4' },
  ],
} satisfies Readonly<Record<string, ReadonlyArray<Mark>>>

export type Name = keyof typeof marks

const viewBox = '0 0 24 24'

/**
 * A line icon drawn as inline SVG. The app carries no icon package and a page
 * needs a dozen marks, so they live here as path data. One set, one weight:
 * every mark draws with a 1.5px stroke beside regular text, in the current
 * color. The rail marks its current section filled as well as colored, so the
 * location survives without color.
 */
export const icon = <Message>(
  name: Name,
  h: HtmlBuilder<Message>,
  sizeClass: string = 'size-4',
  isFilled: boolean = false,
): Html =>
  h.svg(
    [
      h.Class(classNames('shrink-0', sizeClass)),
      h.ViewBox(viewBox),
      h.Fill(isFilled ? 'currentColor' : 'none'),
      h.Stroke('currentColor'),
      h.StrokeWidth('1.5'),
      h.StrokeLinecap('round'),
      h.StrokeLinejoin('round'),
      h.AriaHidden(true),
    ],
    marks[name].map((mark) => h.path([h.D(mark.path)])),
  )

// ICON SWAP

const crossFadeClass =
  'transition-[opacity,filter,scale] duration-300 ease-[cubic-bezier(0.2,0,0,1)]'

/**
 * A mark that changes with its state, crossfading its outline and filled
 * variants rather than swapping assets. Both SVGs stay in the DOM with the
 * filled one overlaid, so entering and leaving both animate. The wrapper owns
 * the layout size, and the state also shows as color on the surrounding
 * control, so the change survives with motion off.
 */
export const iconSwap = <Message>(
  name: Name,
  isActive: boolean,
  h: HtmlBuilder<Message>,
  sizeClass: string = 'size-4',
): Html =>
  h.span([h.Class(classNames('relative inline-flex shrink-0', sizeClass))], [
    h.span(
      [
        h.Class(
          classNames(
            'inline-flex size-full items-center justify-center',
            crossFadeClass,
            isActive ? 'scale-[0.25] opacity-0 blur-[4px]' : 'scale-100 opacity-100 blur-0',
          ),
        ),
      ],
      [icon(name, h, 'size-full')],
    ),
    h.span(
      [
        h.Class(
          classNames(
            'absolute inset-0 inline-flex items-center justify-center',
            crossFadeClass,
            isActive ? 'scale-100 opacity-100 blur-0' : 'scale-[0.25] opacity-0 blur-[4px]',
          ),
        ),
      ],
      [icon(name, h, 'size-full', true)],
    ),
  ])
