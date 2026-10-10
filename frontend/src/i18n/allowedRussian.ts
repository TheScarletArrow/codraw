/**
 * Russian in the code that is not a text of the interface, by the path of the file under `src/`: e.g. letters that the
 * search treats alike, or `'all'` for a file of data in both languages. Each entry says why it stays.
 */
export const ALLOWED_RUSSIAN: Record<string, readonly string[] | 'all'> = {
  // The names of the languages in the switch are their own names, the same in any language of the interface.
  'i18n/i18n.ts': ['Русский'],
  // The novelties of every release in both languages; whatsNew.test.ts checks that each one has its English text.
  'releaseNotes/releases.ts': 'all',
  // The import of MADR files reads their Russian headings, statuses and keys, and transliterates names of files.
  'decisions/madr.ts': 'all',
  // Mentions find people with «ё» as «е».
  'comments/threads.ts': ['ё', 'е'],
  // Sample documents of the tests of the imports, in Russian like the tests.
  'apiSpec/testDocuments.ts': 'all',
  'architecture/testArchitecture.ts': 'all',
  'architecture/testPages.ts': 'all',
  'drawio/fixtures.ts': 'all',
  'sql/migrationTesting.ts': 'all',
}
