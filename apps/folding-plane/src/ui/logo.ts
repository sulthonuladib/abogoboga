import { type Html, type HtmlBuilder } from 'foldkit/html'

import { classNames } from './classNames'
import { isFilled } from './format'

// LOGO

const frameClass = 'logo-frame'

const initialOf = (value: string): string => value.trim().charAt(0).toUpperCase() || '?'

/**
 * A coin or exchange logo: the image where the record carries one, otherwise
 * the symbol it stands in for. Both sit in the same frame with a one-pixel
 * outline at low opacity, so the mark keeps its edge on either surface.
 *
 * `isDecorative` pairs the mark with an adjacent text label: the image is
 * announced as decorative and the fallback is hidden, so the label owns the
 * accessible name while the mark only carries the picture.
 */
export const logo = <Message>(
  input: Readonly<{
    src: string
    fallback: string
    alt: string
    h: HtmlBuilder<Message>
    sizeClass?: string | undefined
    isDecorative?: boolean | undefined
  }>,
): Html => {
  const { h } = input
  const size = input.sizeClass ?? 'size-8'
  const isDecorative = input.isDecorative === true

  if (isFilled(input.src)) {
    return h.img([
      h.Src(input.src.trim()),
      h.Alt(isDecorative ? '' : input.alt),
      h.Decoding('async'),
      h.Loading('lazy'),
      h.Class(classNames(size, 'shrink-0 rounded-lg bg-card object-cover', frameClass)),
    ])
  }

  return h.span(
    [
      h.Class(
        classNames(
          size,
          'inline-flex shrink-0 items-center justify-center rounded-lg bg-muted text-xs font-medium text-muted-foreground',
          frameClass,
        ),
      ),
      ...(isDecorative
        ? [h.AriaHidden(true)]
        : [h.Title(input.alt), h.AriaLabel(input.alt)]),
    ],
    [isDecorative ? initialOf(input.fallback) : input.fallback],
  )
}
