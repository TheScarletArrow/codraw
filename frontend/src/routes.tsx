import type { RouteObject } from 'react-router'
import { AppError } from './errors/AppError.tsx'
import { Layout } from './Layout.tsx'
import { PrivacyPage } from './legal/PrivacyPage.tsx'
import { TermsPage } from './legal/TermsPage.tsx'
import { BoardsPage } from './pages/BoardsPage.tsx'
import { ConnectionsPage } from './pages/ConnectionsPage.tsx'
import { InvitePage } from './pages/InvitePage.tsx'
import { LoginPage } from './pages/LoginPage.tsx'
import { NotificationSettingsPage } from './pages/NotificationSettingsPage.tsx'
import { WorkspaceInvitePage } from './pages/WorkspaceInvitePage.tsx'
import { WorkspacePage } from './pages/WorkspacePage.tsx'

export const routes: RouteObject[] = [
  { path: '/login', element: <LoginPage />, errorElement: <AppError /> },
  // Read before signing in, so outside of the pages of a signed-in user.
  { path: '/privacy', element: <PrivacyPage />, errorElement: <AppError /> },
  { path: '/terms', element: <TermsPage />, errorElement: <AppError /> },
  {
    // A board that its link shows to anybody, read without a session and in frames of other sites.
    path: '/view/:boardId',
    errorElement: <AppError />,
    lazy: async () => ({ Component: (await import('./pages/PublicBoardPage.tsx')).PublicBoardPage }),
  },
  {
    path: '/',
    element: <Layout />,
    errorElement: <AppError />,
    children: [
      { index: true, element: <BoardsPage /> },
      // An invitation needs a signed-in user: a visitor without a session comes back here from the login page.
      { path: 'invite/:token', element: <InvitePage /> },
      // Workspaces need an account of GitHub or Google: the page tells a guest to sign in.
      { path: 'workspace-invite/:token', element: <WorkspaceInvitePage /> },
      { path: 'workspaces/:workspaceId', element: <WorkspacePage /> },
      // The link of a letter that confirms an address comes here too, with `?confirm=`.
      { path: 'settings/notifications', element: <NotificationSettingsPage /> },
      { path: 'settings/connections', element: <ConnectionsPage /> },
      {
        path: 'boards/:boardId',
        // The editor pulls in maxGraph, so it is loaded only when a board is opened.
        lazy: async () => ({ Component: (await import('./pages/BoardPage.tsx')).BoardPage }),
      },
      {
        // The draft of a proposal of changes of a board, in the editor of the board.
        path: 'boards/:boardId/proposals/:proposalId',
        lazy: async () => ({ Component: (await import('./pages/ProposalPage.tsx')).ProposalPage }),
      },
    ],
  },
]
