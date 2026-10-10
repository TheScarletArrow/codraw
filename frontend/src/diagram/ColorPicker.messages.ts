import { defineMessages } from '../i18n/i18n.ts'

export const colorPickerMessages = defineMessages({
  ru: {
    transparency: 'Прозрачность',
    customColor: 'Свой цвет',
    gradient: 'Градиент',
    gradientColor: 'Второй цвет градиента',
    gradientDirection: 'Направление градиента',
    directions: { south: 'Вниз', north: 'Вверх', east: 'Вправо', west: 'Влево' },
  },
  en: {
    transparency: 'Transparency',
    customColor: 'Custom color',
    gradient: 'Gradient',
    gradientColor: 'Second color of the gradient',
    gradientDirection: 'Direction of the gradient',
    directions: { south: 'Down', north: 'Up', east: 'Right', west: 'Left' },
  },
})
