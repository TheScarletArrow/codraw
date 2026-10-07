import { afterEach, describe, expect, it } from 'vitest'
import { carriedKeys, copyLook, STYLE_PARTS, styleChanges, styleClipboard, TABLE_ROW_KEYS } from './styleCopy.ts'

describe('styleCopy', () => {
  afterEach(() => styleClipboard.clear())

  it('carries over exactly the fill, the line and the text that the toolbar sets', () => {
    expect(STYLE_PARTS).toEqual({
      fill: ['fillColor', 'fillOpacity'],
      line: ['strokeColor', 'strokeWidth', 'dashed', 'dashPattern'],
      text: ['fontColor', 'fontSize', 'fontFamily', 'fontStyle', 'align'],
    })
    expect(TABLE_ROW_KEYS).toEqual(['fontFamily', 'fontSize'])
  })

  it('carries over the parts that both elements have', () => {
    const fill = ['fillColor', 'fillOpacity']
    const line = ['strokeColor', 'strokeWidth', 'dashed', 'dashPattern']
    const text = ['fontColor', 'fontSize', 'fontFamily', 'fontStyle', 'align']

    expect(carriedKeys('shape', 'shape')).toEqual([...fill, ...line, ...text])
    expect(carriedKeys('shape', 'edge')).toEqual([...line, ...text])
    expect(carriedKeys('edge', 'shape')).toEqual([...line, ...text])
    expect(carriedKeys('edge', 'edge')).toEqual([...line, ...text])
    expect(carriedKeys('shape', 'label')).toEqual(text)
    expect(carriedKeys('label', 'shape')).toEqual(text)
    expect(carriedKeys('label', 'edge')).toEqual(text)
  })

  it('copies the look and nothing of the size, the form, the meaning or the service of an element', () => {
    const style = {
      fillColor: '#dae8fc',
      fillOpacity: 60,
      strokeColor: '#b85450',
      strokeWidth: 3,
      dashed: true,
      dashPattern: '1 2',
      fontColor: '#ffffff',
      fontSize: 20,
      fontFamily: 'Georgia',
      fontStyle: 3,
      align: 'left',
      shape: 'ellipse',
      perimeter: 'ellipsePerimeter',
      rounded: true,
      rotation: 45,
      autosize: true,
      whiteSpace: 'wrap',
      edgeStyle: 'none',
      curved: true,
      startArrow: 'ERmandOne',
      endArrow: 'ERmany',
      locked: true,
      codrawLockedBy: 'Алиса',
      codrawShape: 'ellipse',
      dbVendor: 'postgresql',
      startSize: 40,
      image: 'data:image/png;base64,AAAA',
      link: 'https://example.com',
      shadow: true,
      gradientColor: '#ffffff',
    }

    expect(copyLook(style, 'shape')).toEqual({
      kind: 'shape',
      values: {
        fillColor: '#dae8fc',
        fillOpacity: 60,
        strokeColor: '#b85450',
        strokeWidth: 3,
        dashed: true,
        dashPattern: '1 2',
        fontColor: '#ffffff',
        fontSize: 20,
        fontFamily: 'Georgia',
        fontStyle: 3,
        align: 'left',
      },
    })
    expect(copyLook(style, 'edge').values).not.toHaveProperty('fillColor')
    expect(Object.keys(copyLook(style, 'label').values)).toEqual(['fontColor', 'fontSize', 'fontFamily', 'fontStyle', 'align'])
  })

  it('changes the keys that differ and brings back the defaults that the copied element has', () => {
    const copied = copyLook({ fillColor: '#dae8fc', strokeWidth: 3, fontSize: 13 }, 'shape')

    expect(
      styleChanges(copied, { fillColor: '#fff2cc', dashed: true, dashPattern: '8 4', fontSize: 13, shape: 'note' }, 'shape'),
    ).toEqual({ fillColor: '#dae8fc', strokeWidth: 3, dashed: undefined, dashPattern: undefined })
    expect(styleChanges(copied, { fillColor: '#dae8fc', strokeWidth: 3, fontSize: 13 }, 'shape')).toEqual({})
  })

  it('leaves the fill of a shape that gets the look of an edge, and gives a label its text only', () => {
    const edge = copyLook({ strokeColor: '#0000ff', dashed: true, fontSize: 11, endArrow: 'none' }, 'edge')
    const shape = copyLook({ fillColor: '#dae8fc', strokeColor: '#ff0000', fontFamily: 'Georgia', fontSize: 20 }, 'shape')

    expect(styleChanges(edge, { fillColor: '#fff2cc', fontSize: 13 }, 'shape')).toEqual({
      strokeColor: '#0000ff',
      dashed: true,
      fontSize: 11,
    })
    expect(styleChanges(shape, { fillColor: 'none', strokeColor: 'none', fontSize: 13 }, 'label')).toEqual({
      fontFamily: 'Georgia',
      fontSize: 20,
    })
    expect(styleChanges(shape, { endArrow: 'classic', fontSize: 11 }, 'edge')).toEqual({
      strokeColor: '#ff0000',
      fontFamily: 'Georgia',
      fontSize: 20,
    })
  })

  it('narrows the keys, e.g. to the font and the size for the fields of a table', () => {
    const copied = copyLook({ fillColor: '#dae8fc', fontFamily: 'Courier New', fontSize: 16, fontStyle: 1 }, 'shape')

    expect(styleChanges(copied, { align: 'left', fontSize: 13 }, 'label', TABLE_ROW_KEYS)).toEqual({
      fontFamily: 'Courier New',
      fontSize: 16,
    })
  })

  it('keeps the look copied last in the tab', () => {
    expect(styleClipboard.read()).toBeNull()
    const first = copyLook({ fillColor: '#dae8fc' }, 'shape')
    const second = copyLook({ strokeColor: '#ff0000' }, 'edge')

    styleClipboard.put(first)
    styleClipboard.put(second)

    expect(styleClipboard.read()).toBe(second)
  })
})
