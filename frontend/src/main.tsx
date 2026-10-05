import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { installErrorReporting, reportError } from './errors/reporting.ts'

installErrorReporting()

createRoot(document.getElementById('root')!, {
  // Errors of drawing: those that the error elements of the routes catch, and those that break the whole app.
  onCaughtError: (error) => reportError('render', error),
  onUncaughtError: (error) => reportError('render', error),
}).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
