import { describe, expect, it } from 'vitest'
import { embedMarkdown, embedUrl } from './links.ts'

const embed = { path: '/api/embeds/AAAAAAAAAAAAAAAAAAAAAA.svg', pageId: 'page-1', updatedAt: null }

describe('links of the live image', () => {
  it('gives the address on this site and the image in Markdown', () => {
    expect(embedUrl(embed, 'https://codraw.example')).toBe('https://codraw.example/api/embeds/AAAAAAAAAAAAAAAAAAAAAA.svg')
    expect(embedMarkdown(embed, 'Схема [v2]', 'https://codraw.example')).toBe(
      '![Схема \\[v2\\]](https://codraw.example/api/embeds/AAAAAAAAAAAAAAAAAAAAAA.svg)',
    )
  })
})
