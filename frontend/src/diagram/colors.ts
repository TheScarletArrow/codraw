/** The standard draw.io palette: light colors for fills, dark ones for lines and text. */
export const PALETTE = [
  { value: '#ffffff', name: 'Белый' },
  { value: '#f5f5f5', name: 'Светло-серый' },
  { value: '#dae8fc', name: 'Голубой' },
  { value: '#d5e8d4', name: 'Светло-зелёный' },
  { value: '#fff2cc', name: 'Светло-жёлтый' },
  { value: '#ffe6cc', name: 'Персиковый' },
  { value: '#f8cecc', name: 'Розовый' },
  { value: '#e1d5e7', name: 'Сиреневый' },
  { value: '#1f2328', name: 'Чёрный' },
  { value: '#666666', name: 'Серый' },
  { value: '#6c8ebf', name: 'Синий' },
  { value: '#82b366', name: 'Зелёный' },
  { value: '#d6b656', name: 'Жёлтый' },
  { value: '#d79b00', name: 'Оранжевый' },
  { value: '#b85450', name: 'Красный' },
  { value: '#9673a6', name: 'Фиолетовый' },
] as const

/**
 * Colors of stickies: the light colors of the palette, so that «Заливка» shows the color of a sticky as chosen. The
 * first one is the color of new stickies until another is chosen.
 */
export const STICKY_COLORS = [
  { value: '#fff2cc', name: 'Жёлтый' },
  { value: '#f8cecc', name: 'Розовый' },
  { value: '#d5e8d4', name: 'Зелёный' },
  { value: '#dae8fc', name: 'Голубой' },
  { value: '#e1d5e7', name: 'Сиреневый' },
] as const
