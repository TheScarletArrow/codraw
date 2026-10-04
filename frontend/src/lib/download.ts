/** Characters that file systems do not allow in names. */
const FORBIDDEN_IN_NAMES = /[\\/:*?"<>|]+/g

/** A file name from `base` and `extension`: forbidden characters become `_`, an empty name becomes «Доска». */
export function fileName(base: string, extension: string): string {
  return `${base.replace(FORBIDDEN_IN_NAMES, '_').trim() || 'Доска'}.${extension}`
}

/** Saves `blob` as a file named `name` through the downloads of the browser. */
export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = name
  document.body.append(link)
  link.click()
  link.remove()
  // The browser starts the download asynchronously.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
