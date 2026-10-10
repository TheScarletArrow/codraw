/**
 * Russian in the code that is not a text of the interface, by the path of the file under `src/`: e.g. letters that the
 * search treats alike, or `'all'` for a file of data in both languages. Each entry says why it stays.
 */
export const ALLOWED_RUSSIAN: Record<string, readonly string[] | 'all'> = {
  // The names of the languages in the switch are their own names, the same in any language of the interface.
  'i18n/i18n.ts': ['Русский'],
  // The novelties of every release in both languages; whatsNew.test.ts checks that each one has its English text.
  'releaseNotes/releases.ts': 'all',
}
