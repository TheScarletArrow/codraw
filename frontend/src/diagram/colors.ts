import { colorMessages } from './colors.messages.ts'

/** The fill of shapes without one of their own, as the default style of the editor sets it. */
export const DEFAULT_FILL_COLOR = '#ffffff'

/** The color of lines and text without one of their own, as the default style of the editor sets it. */
export const DEFAULT_LINE_COLOR = '#1f2328'

/** A color of the palette, named in the language of the interface. */
const color = <V extends string>(value: V, name: keyof typeof colorMessages) => ({
  value,
  get name(): string {
    return colorMessages[name]
  },
})

/** The standard draw.io palette: light colors for fills, dark ones for lines and text. */
export const PALETTE = [
  color('#ffffff', 'white'),
  color('#f5f5f5', 'lightGray'),
  color('#dae8fc', 'lightBlue'),
  color('#d5e8d4', 'lightGreen'),
  color('#fff2cc', 'lightYellow'),
  color('#ffe6cc', 'peach'),
  color('#f8cecc', 'pink'),
  color('#e1d5e7', 'lilac'),
  color('#1f2328', 'black'),
  color('#666666', 'gray'),
  color('#6c8ebf', 'blue'),
  color('#82b366', 'green'),
  color('#d6b656', 'yellow'),
  color('#d79b00', 'orange'),
  color('#b85450', 'red'),
  color('#9673a6', 'purple'),
] as const

/**
 * Colors of stickies: the light colors of the palette, so that «Заливка» shows the color of a sticky as chosen. The
 * first one is the color of new stickies until another is chosen.
 */
export const STICKY_COLORS = [
  color('#fff2cc', 'yellow'),
  color('#f8cecc', 'pink'),
  color('#d5e8d4', 'green'),
  color('#dae8fc', 'lightBlue'),
  color('#e1d5e7', 'lilac'),
] as const
