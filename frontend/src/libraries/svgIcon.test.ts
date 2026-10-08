import { describe, expect, it } from 'vitest'
import { cleanSvg, iconSize, svgDataUri } from './svgIcon.ts'

const parse = (svg: string) => new DOMParser().parseFromString(svg, 'image/svg+xml').documentElement

describe('cleaning SVG for a library', () => {
  it('keeps paths, gradients, styles, links inside the picture and embedded raster pictures', () => {
    const icon = cleanSvg(
      `<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="24" height="24" viewBox="0 0 24 24">` +
        `<defs><linearGradient id="g"><stop offset="0" stop-color="#f00"/></linearGradient><style>.a { fill: url(#g) }</style></defs>` +
        `<path id="p" d="M0 0h24v24H0z" fill="url('#g')"/><use xlink:href="#p"/>` +
        `<image width="1" height="1" href="data:image/png;base64,iVBORw0KGgo="/></svg>`,
    )!

    const root = parse(icon.svg)
    expect(root.querySelector('linearGradient')).not.toBeNull()
    expect(root.querySelector('style')?.textContent).toBe('.a { fill: url(#g) }')
    expect(root.querySelector('path')?.getAttribute('fill')).toBe("url('#g')")
    expect(root.querySelector('use')?.getAttributeNS('http://www.w3.org/1999/xlink', 'href')).toBe('#p')
    expect(root.querySelector('image')?.getAttribute('href')).toBe('data:image/png;base64,iVBORw0KGgo=')
    expect([icon.width, icon.height]).toEqual([24, 24])
  })

  it('drops scripts, handlers, foreign objects, animations, outside links and styles, and what is not SVG', () => {
    const icon = cleanSvg(
      `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" onload="alert(1)" inkscape:version="1.3">` +
        `<script>alert(1)</script><foreignObject><div xmlns="http://www.w3.org/1999/xhtml">x</div></foreignObject>` +
        `<rect width="2" height="2" onclick="alert(2)" style="fill: url(https://example.com/x)" fill="url(https://example.com/#g)">` +
        `<animate attributeName="x" to="1"/><set attributeName="fill" to="red"/></rect>` +
        `<image href="https://example.com/a.png"/><use xlink:href="other.svg#a"/><a href="javascript:alert(1)"><circle r="1"/></a>` +
        `<style>@import url(https://example.com/a.css);</style><!-- comment --><inkscape:grid/></svg>`,
    )!

    expect(icon.svg).not.toMatch(/script|alert|foreignObject|animate|<set|example\.com|other\.svg|inkscape:grid|inkscape:version|@import|comment/)
    const root = parse(icon.svg)
    expect(root.querySelector('rect')?.getAttribute('width')).toBe('2')
    expect(root.querySelector('circle')).not.toBeNull()
  })

  it('keeps references inside the picture with spaces before a quote, and drops escapes of CSS and sets of images', () => {
    const icon = cleanSvg(
      `<svg xmlns="http://www.w3.org/2000/svg"><style>.a { fill: url( '#g') }</style>` +
        `<rect fill="url( '#g')" stroke="url(\u00A0#g)" style="background: u\\72l(https://example.com/x)"/>` +
        `<circle style="cursor: -webkit-image-set('https://example.com/x' 1x)"/><style>@\\69mport "https://example.com/a.css";</style></svg>`,
    )!

    const root = parse(icon.svg)
    expect(root.querySelector('style')?.textContent).toBe(".a { fill: url( '#g') }")
    expect(root.querySelectorAll('style')).toHaveLength(1)
    expect(root.querySelector('rect')?.getAttribute('fill')).toBe("url( '#g')")
    // Spaces of Unicode are no spaces of CSS, as the backend reads it.
    expect(root.querySelector('rect')?.hasAttribute('stroke')).toBe(false)
    expect(root.querySelector('rect')?.hasAttribute('style')).toBe(false)
    expect(root.querySelector('circle')?.hasAttribute('style')).toBe(false)
  })

  it('gives an SVG without its own size the size of its viewBox, and one side the other one', () => {
    expect(cleanSvg('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 32"/>')).toMatchObject({ width: 48, height: 32 })
    const half = cleanSvg('<svg xmlns="http://www.w3.org/2000/svg" width="24" viewBox="0 0 48 32"/>')!
    expect(half).toMatchObject({ width: 24, height: 16 })
    expect(parse(half.svg).getAttribute('height')).toBe('16')
    expect(cleanSvg('<svg xmlns="http://www.w3.org/2000/svg" width="100%"/>')).toMatchObject({ width: null, height: null })
  })

  it('is no SVG for HTML, broken XML or another root', () => {
    expect(cleanSvg('<html xmlns="http://www.w3.org/1999/xhtml"/>')).toBeNull()
    expect(cleanSvg('<svg xmlns="http://www.w3.org/2000/svg"><rect></svg>')).toBeNull()
    expect(cleanSvg('просто текст')).toBeNull()
  })

  it('writes the SVG with base64 of its UTF-8, as the logos of the palette', () => {
    const uri = svgDataUri('<svg xmlns="http://www.w3.org/2000/svg"><title>Логотип</title></svg>')
    expect(uri.startsWith('data:image/svg+xml;base64,')).toBe(true)
    const bytes = Uint8Array.from(atob(uri.split(',')[1]!), (char) => char.charCodeAt(0))
    expect(new TextDecoder().decode(bytes)).toContain('Логотип')
  })

  it('sizes an icon by its own size, at least 64 on its larger side and at most the limit, or 64 × 64 without one', () => {
    expect(iconSize(null, null, 600)).toEqual({ width: 64, height: 64 })
    expect(iconSize(24, 12, 600)).toEqual({ width: 64, height: 32 })
    expect(iconSize(200, 100, 600)).toEqual({ width: 200, height: 100 })
    expect(iconSize(1200, 600, 600)).toEqual({ width: 600, height: 300 })
  })
})
