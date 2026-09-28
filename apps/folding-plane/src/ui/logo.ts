import { type Html, type HtmlBuilder } from 'foldkit/html'

import { classNames } from './classNames'
import { isFilled } from './format'

// LOGO

const frameClass = 'logo-frame'

/**
 * A coin or exchange logo: the image where the record carries one, otherwise
 * the symbol it stands in for. Both sit in the same frame with a one-pixel
 * outline at low opacity, so the mark keeps its edge on either surface.
 */
export const logo = <Message>(
  input: Readonly<{
    src: string
    fallback: string
    alt: string
    h: HtmlBuilder<Message>
    sizeClass?: string | undefined
  }>,
): Html => {
  const { h } = input
  const size = input.sizeClass ?? 'size-8'

  if (isFilled(input.src)) {
    return h.img([
      h.Src(input.src.trim()),
      h.Alt(input.alt),
      h.Class(classNames(size, 'rounded-lg bg-card object-cover', frameClass)),
    ])
  }

  return h.span(
    [
      h.Class(
        classNames(
          size,
          'inline-flex items-center justify-center rounded-lg bg-muted text-xs font-medium text-muted-foreground',
          frameClass,
        ),
      ),
      h.Title(input.alt),
      h.AriaLabel(input.alt),
    ],
    [input.fallback],
  )
}
