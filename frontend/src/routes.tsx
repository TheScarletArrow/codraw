import type { RouteObject } from 'react-router'
import { Layout } from './Layout.tsx'
import { BoardsPage } from './pages/BoardsPage.tsx'

export const routes: RouteObject[] = [
  {
    path: '/',
    element: <Layout />,
    children: [
      { index: true, element: <BoardsPage /> },
      {
        path: 'boards/:boardId',
        // The editor pulls in maxGraph, so it is loaded only when a board is opened.
        lazy: async () => ({ Component: (await import('./pages/BoardPage.tsx')).BoardPage }),
      },
    ],
  },
]
