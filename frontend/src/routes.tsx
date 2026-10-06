import type { RouteObject } from 'react-router'
import { AppError } from './errors/AppError.tsx'
import { Layout } from './Layout.tsx'
import { PrivacyPage } from './legal/PrivacyPage.tsx'
import { TermsPage } from './legal/TermsPage.tsx'
import { BoardsPage } from './pages/BoardsPage.tsx'
import { InvitePage } from './pages/InvitePage.tsx'
import { LoginPage } from './pages/LoginPage.tsx'

export const routes: RouteObject[] = [
  { path: '/login', element: <LoginPage />, errorElement: <AppError /> },
  // Read before signing in, so outside of the pages of a signed-in user.
  { path: '/privacy', element: <PrivacyPage />, errorElement: <AppError /> },
  { path: '/terms', element: <TermsPage />, errorElement: <AppError /> },
  {
    path: '/',
    element: <Layout />,
    errorElement: <AppError />,
    children: [
      { index: true, element: <BoardsPage /> },
      // An invitation needs a signed-in user: a visitor without a session comes back here from the login page.
      { path: 'invite/:token', element: <InvitePage /> },
      {
        path: 'boards/:boardId',
        // The editor pulls in maxGraph, so it is loaded only when a board is opened.
        lazy: async () => ({ Component: (await import('./pages/BoardPage.tsx')).BoardPage }),
      },
    ],
  },
]
