import { describe, expect, it } from 'vitest'
import { LAYER_CELL_ID } from '../diagram/model.ts'
import { SAMPLE_DRAWIO, SINGLE_MODEL } from './fixtures.ts'
import { htmlToText } from './labels.ts'
import { DrawioFormatError, parseDrawio, type DrawioCell } from './parse.ts'

const byId = (cells: DrawioCell[]) => new Map(cells.map((cell) => [cell.id, cell]))

async function deflateRaw(text: string): Promise<string> {
  const reader = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(text))
      controller.close()
    },
  })
    .pipeThrough(new CompressionStream('deflate-raw') as unknown as ReadableWritablePair<Uint8Array, Uint8Array>)
    .getReader()
  let binary = ''
  for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) {
    binary += Array.from(chunk.value, (byte) => String.fromCharCode(byte)).join('')
  }
  return btoa(binary)
}

/** Compresses the diagrams of a file as draw.io does: base64 of raw deflate of the URI-encoded model. */
async function compress(xml: string): Promise<string> {
  const pattern = /(<diagram[^>]*>)\s*(<mxGraphModel[\s\S]*?<\/mxGraphModel>)\s*(<\/diagram>)/g
  let result = ''
  let last = 0
  for (const match of xml.matchAll(pattern)) {
    result += xml.slice(last, match.index) + match[1] + (await deflateRaw(encodeURIComponent(match[2]!))) + match[3]
    last = match.index + match[0].length
  }
  return result + xml.slice(last)
}

describe('parseDrawio', () => {
  it('reads every diagram as a page with its id and name', async () => {
    const pages = await parseDrawio(SAMPLE_DRAWIO)

    expect(pages.map(({ id, name }) => ({ id, name }))).toEqual([
      { id: 'ctx-page', name: 'Контекст' },
      { id: 'layers-page', name: 'Слои' },
    ])
  })

  it('reads shapes, edges and their geometry, with the layer of the page as the parent', async () => {
    const cells = byId((await parseDrawio(SAMPLE_DRAWIO))[0]!.cells)

    expect(cells.get('api')).toMatchObject({
      kind: 'vertex',
      parent: LAYER_CELL_ID,
      value: 'API\nGateway',
      geometry: { x: 40, y: 80, width: 120, height: 60 },
      style: { rounded: true, whiteSpace: 'wrap', fillColor: '#dae8fc', strokeColor: '#6c8ebf', fontSize: 12 },
    })
    expect(cells.get('api')!.style).not.toHaveProperty('html')
    expect(cells.get('edge')).toMatchObject({
      kind: 'edge',
      source: 'api',
      target: 'db',
      geometry: { relative: true, points: [{ x: 220, y: 110 }] },
      style: { edgeStyle: 'orthogonalEdgeStyle', rounded: false, orthogonalLoop: true, jettySize: 'auto' },
    })
    expect(cells.get('straight')).toMatchObject({
      value: 'Первая строка\nВторая строка',
      source: null,
      target: null,
      geometry: { sourcePoint: { x: 40, y: 200 }, targetPoint: { x: 160, y: 200 } },
      style: { edgeStyle: 'none', endArrow: 'none', dashed: true },
    })
  })

  it('keeps the custom properties of an <object> and takes its label', async () => {
    const db = byId((await parseDrawio(SAMPLE_DRAWIO))[0]!.cells).get('db')!

    expect(db.value).toBe('Users DB')
    expect(db.attrs).toEqual({ tooltip: 'Primary storage' })
    expect(db.style).toMatchObject({ shape: 'cylinder3', boundedLbl: '1', backgroundOutline: true, size: '15' })
  })

  it('takes the link of a <UserObject> or an <object> for the link of the element, unless CoDraw would not open it', async () => {
    const model = (cells: string) =>
      `<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>${cells}</root></mxGraphModel>`
    const wrapped = (tag: string, id: string, attributes: string) =>
      `<${tag} label="${id}" ${attributes} id="${id}"><mxCell style="link=https://style.example;" vertex="1" parent="1"><mxGeometry width="80" height="40" as="geometry"/></mxCell></${tag}>`
    const [page] = await parseDrawio(
      model(
        wrapped('UserObject', 'page', 'link="data:page/id,containers"') +
          wrapped('object', 'docs', 'tooltip="Документация" link="https://docs.example.com/payments"') +
          wrapped('UserObject', 'script', 'link="javascript:alert(1)"') +
          wrapped('UserObject', 'data', 'link="data:text/html,&lt;script&gt;alert(1)&lt;/script&gt;"'),
      ),
    )
    const cells = byId(page!.cells)

    expect(cells.get('page')).toMatchObject({ value: 'page', style: { link: 'data:page/id,containers' } })
    expect(cells.get('page')!.attrs).toBeUndefined()
    expect(cells.get('docs')).toMatchObject({ style: { link: 'https://docs.example.com/payments' }, attrs: { tooltip: 'Документация' } })
    // A link is not a key of the style of draw.io, and an unsafe one goes.
    expect(cells.get('script')!.style).not.toHaveProperty('link')
    expect(cells.get('data')!.style).not.toHaveProperty('link')
    expect(cells.get('script')!.attrs).toBeUndefined()
  })

  it('reads a label of an edge as a cell of the edge that edges cannot connect to', async () => {
    const label = byId((await parseDrawio(SAMPLE_DRAWIO))[0]!.cells).get('label')!

    expect(label).toMatchObject({ parent: 'edge', value: 'SQL', geometry: { x: -0.2, relative: true } })
    expect(label.geometry).not.toHaveProperty('offset')
    expect(label.style).toMatchObject({ connectable: false, labelBackgroundColor: '#ffffff', fontSize: 11 })
  })

  it('puts the cells of all layers on the page in drawing order and gives taken ids new ones', async () => {
    const cells = (await parseDrawio(SAMPLE_DRAWIO))[1]!.cells

    expect(cells.map((cell) => cell.value)).toEqual(['На первом слое', 'На втором слое'])
    expect(cells.every((cell) => cell.parent === LAYER_CELL_ID)).toBe(true)
    expect(cells[0]!.id).not.toBe('1')
    expect(cells[0]!.order < cells[1]!.order).toBe(true)
  })

  it('reads compressed diagrams like plain ones', async () => {
    // Taken ids get random new ones, so cells are compared without ids.
    const withoutIds = (pages: Awaited<ReturnType<typeof parseDrawio>>) =>
      pages.map((page) => ({ ...page, cells: page.cells.map(({ id: _id, ...cell }) => cell) }))

    expect(withoutIds(await parseDrawio(await compress(SAMPLE_DRAWIO)))).toEqual(withoutIds(await parseDrawio(SAMPLE_DRAWIO)))
  })

  it('reads a single model and a .drawio.svg file', async () => {
    const [single] = await parseDrawio(SINGLE_MODEL)
    expect(single).toMatchObject({ id: null, name: 'Страница 1', cells: [{ id: 'a', value: 'Один' }] })

    const content = SAMPLE_DRAWIO.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" content="${content}"><g/></svg>`
    expect((await parseDrawio(svg)).map((page) => page.name)).toEqual(['Контекст', 'Слои'])
  })

  it('rejects files that are not draw.io diagrams', async () => {
    for (const text of ['просто текст', '<html><body>Страница</body></html>', '<mxfile></mxfile>', '<mxfile><diagram>%%%</diagram></mxfile>']) {
      await expect(parseDrawio(text)).rejects.toThrow(DrawioFormatError)
    }
    await expect(parseDrawio('просто текст')).rejects.toThrow('Это не файл draw.io')
  })
})

describe('htmlToText', () => {
  it('turns line breaks and blocks into new lines and drops formatting', () => {
    expect(htmlToText('<b>API</b><br>Gateway')).toBe('API\nGateway')
    expect(htmlToText('<div>Первая</div><div>Вторая</div>')).toBe('Первая\nВторая')
    expect(htmlToText('Сервис&nbsp;&amp;&nbsp;БД')).toBe('Сервис & БД')
    expect(htmlToText('<ul><li>один</li><li>два</li></ul>')).toBe('один\nдва')
    expect(htmlToText('<p>текст<script>alert(1)</script><style>p{}</style></p>')).toBe('текст')
  })
})
