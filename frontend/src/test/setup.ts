import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, beforeEach } from 'vitest'

// The backend sets the CSRF cookie with every API response, so the app normally has it.
beforeEach(() => {
  document.cookie = 'XSRF-TOKEN=test-csrf; path=/'
})

afterEach(() => {
  cleanup()
})
