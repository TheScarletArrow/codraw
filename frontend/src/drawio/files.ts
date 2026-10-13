import { downloadBlob, fileName } from '../lib/download.ts'
import { DRAWIO_MIME_TYPE } from './serialize.ts'
import { drawioMessages } from './messages.ts'

/** Board title from the name of a file: without `.drawio`, `.xml`, `.drawio.svg`, `.codraw`. */
export function titleFromFileName(name: string): string {
  return name.replace(/(\.drawio)?\.(drawio|xml|svg|codraw)$/i, '').trim() || drawioMessages.boardFromFile
}

/** Saves the diagram as `<title>.drawio`. */
export function downloadDrawio(title: string, xml: string) {
  downloadBlob(new Blob([xml], { type: DRAWIO_MIME_TYPE }), fileName(title, 'drawio'))
}
