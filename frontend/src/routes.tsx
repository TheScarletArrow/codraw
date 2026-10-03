import type { RouteObject } from 'react-router'
import { Layout } from './Layout.tsx'
import { BoardPage } from './pages/BoardPage.tsx'
import { BoardsPage } from './pages/BoardsPage.tsx'

export const routes: RouteObject[] = [
  {
    path: '/',
    element: <Layout />,
    children: [
      { index: true, element: <BoardsPage /> },
      { path: 'boards/:boardId', element: <BoardPage /> },
    ],
  },
]
