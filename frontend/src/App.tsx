import { QueryClientProvider } from '@tanstack/react-query'
import { createBrowserRouter, RouterProvider } from 'react-router'
import { createQueryClient } from './queryClient.ts'
import { routes } from './routes.tsx'
import { UpdateBanner } from './update/UpdateBanner.tsx'

const queryClient = createQueryClient()
const router = createBrowserRouter(routes)

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
      {/* Outside of the routes, so that every page has it: the help and the public view are outside of the layout. */}
      <UpdateBanner />
    </QueryClientProvider>
  )
}

export default App
