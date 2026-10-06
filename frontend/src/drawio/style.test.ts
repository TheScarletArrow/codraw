import { describe, expect, it } from 'vitest'
import { TABLE_FIELD_STYLE, TABLE_STYLE } from '../diagram/shapes.ts'
import { formatStyle, parseStyle, type Style } from './style.ts'

describe('parseStyle', () => {
  it('reads keys with the types maxGraph expects and drops html', () => {
    expect(parseStyle('rounded=1;dashed=0;fontSize=14;strokeWidth=2;fillColor=#dae8fc;jettySize=auto;html=1;size=15;', 'vertex')).toEqual({
      rounded: true,
      dashed: false,
      fontSize: 14,
      strokeWidth: 2,
      fillColor: '#dae8fc',
      jettySize: 'auto',
      size: '15',
    })
  })

  it('expands the named styles of draw.io, letting the keys of the string win', () => {
    expect(parseStyle('ellipse;whiteSpace=wrap;', 'vertex')).toMatchObject({ shape: 'ellipse', perimeter: 'ellipsePerimeter', whiteSpace: 'wrap' })
    expect(parseStyle('text;align=center;', 'vertex')).toEqual({
      fillColor: 'none',
      gradientColor: 'none',
      strokeColor: 'none',
      align: 'center',
      verticalAlign: 'top',
      fontSize: 12,
    })
    expect(parseStyle('edgeLabel;resizable=0;', 'vertex')).toMatchObject({ fontSize: 11, labelBackgroundColor: '#ffffff', resizable: false })
    expect(parseStyle('swimlane;startSize=30;', 'vertex')).toMatchObject({ shape: 'swimlane', startSize: 30, fontStyle: 1 })
  })

  it('reads autosize of draw.io texts as auto width', () => {
    expect(parseStyle('text;autosize=1;', 'vertex')).toMatchObject({ autosize: true })
    expect(formatStyle({ autosize: true }, 'vertex')).toContain('autosize=1;')
  })

  it('keeps unknown named styles', () => {
    expect(parseStyle('shadowCard;fillColor=#ffffff;', 'vertex').baseStyleNames).toEqual(['shadowCard'])
  })

  it('makes the defaults of draw.io explicit where CoDraw has others', () => {
    expect(parseStyle('endArrow=none;', 'edge')).toEqual({ endArrow: 'none', edgeStyle: 'none', labelBackgroundColor: '#ffffff' })
    expect(parseStyle('edgeStyle=orthogonalEdgeStyle;labelBackgroundColor=none;', 'edge')).toMatchObject({
      edgeStyle: 'orthogonalEdgeStyle',
      labelBackgroundColor: 'none',
    })
    expect(parseStyle('', 'vertex')).toEqual({ fontSize: 12 })
  })

  it('replaces colors that maxGraph does not understand', () => {
    expect(parseStyle('fillColor=default;strokeColor=default;fontColor=light-dark(#333333,#eeeeee);', 'vertex')).toMatchObject({
      fillColor: '#ffffff',
      strokeColor: '#000000',
      fontColor: '#333333',
    })
  })

  it('restores the base64 marker of data images', () => {
    expect(parseStyle('shape=image;image=data:image/png,iVBORw0KGgo=;', 'vertex').image).toBe('data:image/png;base64,iVBORw0KGgo=')
    expect(parseStyle('shape=image;image=https://example.com/a.png;', 'vertex').image).toBe('https://example.com/a.png')
  })
})

describe('formatStyle', () => {
  it('writes booleans as 0 and 1, named styles first and the defaults of CoDraw', () => {
    expect(formatStyle({ baseStyleNames: ['shadowCard'], rounded: true, movable: false, fontSize: 14 }, 'vertex')).toBe(
      'shadowCard;rounded=1;movable=0;fontSize=14;',
    )
    expect(formatStyle({}, 'vertex')).toBe('fontSize=13;')
    expect(formatStyle({ endArrow: 'ERmany' }, 'edge')).toBe('endArrow=ERmany;edgeStyle=orthogonalEdgeStyle;labelBackgroundColor=none;')
  })

  it('removes the base64 marker of data images, as its semicolon would end the value', () => {
    expect(formatStyle({ shape: 'image', image: 'data:image/png;base64,iVBORw0KGgo=' }, 'vertex')).toBe(
      'shape=image;image=data:image/png,iVBORw0KGgo=;fontSize=13;',
    )
  })

  it('reads back the styles of the CoDraw palette unchanged', () => {
    const styles: Style[] = [
      TABLE_STYLE as Style,
      TABLE_FIELD_STYLE as Style,
      { shape: 'cylinder', direction: 'south', fontSize: 13 },
      { fillColor: 'none', strokeColor: '#1f2328', dashed: true, dashPattern: '8 4', pointerEvents: false, spacingLeft: 10, fontSize: 13 },
    ]
    for (const style of styles) expect(parseStyle(formatStyle(style, 'vertex'), 'vertex')).toEqual({ fontSize: 13, ...style })
    const edge: Style = { endArrow: 'ERoneToMany', startArrow: 'ERmandOne', strokeColor: '#b85450' }
    expect(parseStyle(formatStyle(edge, 'edge'), 'edge')).toEqual({ ...edge, edgeStyle: 'orthogonalEdgeStyle', labelBackgroundColor: 'none' })
  })
})

describe('fonts in files of draw.io', () => {
  it('keeps the font of a label both ways', () => {
    expect(parseStyle('text;fontFamily=Times New Roman;', 'vertex').fontFamily).toBe('Times New Roman')
    expect(parseStyle(formatStyle({ fontFamily: 'Courier New' }, 'vertex'), 'vertex').fontFamily).toBe('Courier New')
  })
})

describe('text wrap in files of draw.io', () => {
  it('keeps the wrap of a label both ways', () => {
    expect(parseStyle('rounded=1;whiteSpace=wrap;html=1;', 'vertex').whiteSpace).toBe('wrap')
    expect(parseStyle(formatStyle({ whiteSpace: 'wrap' }, 'vertex'), 'vertex').whiteSpace).toBe('wrap')
  })
})

describe('indexes in files of draw.io', () => {
  it('keeps the key of a row of an index both ways', () => {
    expect(formatStyle({ codrawIndex: true }, 'vertex')).toContain('codrawIndex=1')
    expect(parseStyle(formatStyle({ codrawIndex: true }, 'vertex'), 'vertex')).toMatchObject({ codrawIndex: true })
  })
})

describe('base tables in files of draw.io', () => {
  it('keeps the keys of base tables and inherited fields both ways', () => {
    const table = { codrawBase: true, codrawBaseDefault: true, codrawBaseTable: 'base' }
    expect(parseStyle(formatStyle(table, 'vertex'), 'vertex')).toMatchObject(table)
    expect(parseStyle(formatStyle({ codrawInherited: 'field' }, 'vertex'), 'vertex')).toMatchObject({ codrawInherited: 'field' })
  })
})
