import { useRouteError } from 'react-router'
import { Button } from '@/components/ui/button'
import { isChunkLoadError } from '../update/lazyPage.ts'
import { StaleClient } from '../update/StaleClient.tsx'
import { errorsMessages as m } from './messages.ts'

/**
 * Shown instead of a page that broke while it was drawn: React Router reports the error to the root of React. A page
 * whose file did not load, e.g. after a deployment, gets a reload instead.
 */
export function AppError() {
  if (isChunkLoadError(useRouteError())) return <StaleClient />
  return (
    <div role="alert" className="flex min-h-svh flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-xl font-semibold">{m.title}</h1>
      <p className="max-w-md text-muted-foreground">{m.text}</p>
      <Button type="button" onClick={() => location.reload()}>
        {m.reload}
      </Button>
    </div>
  )
}
