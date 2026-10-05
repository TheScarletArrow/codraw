import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, beforeEach } from 'vitest'

// The backend sets the CSRF cookie with every API response, so the app normally has it. Tests of code that runs in a
// worker run without a document.
beforeEach(() => {
  if (typeof document !== 'undefined') document.cookie = 'XSRF-TOKEN=test-csrf; path=/'
})

afterEach(() => {
  cleanup()
})
