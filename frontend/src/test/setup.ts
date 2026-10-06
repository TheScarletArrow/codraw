import '@testing-library/jest-dom/vitest'
import 'fake-indexeddb/auto'
import { cleanup } from '@testing-library/react'
import { IDBFactory } from 'fake-indexeddb'
import { afterEach, beforeEach } from 'vitest'

// The backend sets the CSRF cookie with every API response, so the app normally has it. Tests of code that runs in a
// worker run without a document.
beforeEach(() => {
  if (typeof document !== 'undefined') document.cookie = 'XSRF-TOKEN=test-csrf; path=/'
})

// Every test starts in a browser that keeps nothing for the site yet: no local copies of boards, no registry of them.
beforeEach(() => {
  globalThis.indexedDB = new IDBFactory()
  if (typeof localStorage !== 'undefined') localStorage.clear()
})

afterEach(() => {
  cleanup()
})
