import type { ReactNode } from 'react'
import { defineMessages, pluralEn, pluralRu } from '../i18n/i18n.ts'

const boardsRu = (n: number) => `${n} ${pluralRu(n, 'доска', 'доски', 'досок')}`
const boardsEn = (n: number) => `${n} ${pluralEn(n, 'board', 'boards')}`
const membersRu = (n: number) => `${n} ${pluralRu(n, 'участник', 'участника', 'участников')}`
const membersEn = (n: number) => `${n} ${pluralEn(n, 'member', 'members')}`

/** The texts of the team workspaces: their list, members, invitations, projects and the access to their boards. */
export const workspacesMessages = defineMessages({
  ru: {
    roles: { owner: 'Владелец', admin: 'Администратор', editor: 'Редактор', viewer: 'Читатель' },
    accessOptions: {
      edit: { label: 'Редактирование', description: 'Редакторы пространства правят доску, читатели смотрят' },
      view: { label: 'Просмотр', description: 'Все участники пространства только смотрят доску' },
      none: {
        label: 'Только приглашённые',
        description: 'Доску открывают её участники и те, кто управляет пространством',
      },
    },
    accessOfOthers: {
      edit: 'Редакторы пространства правят доску, читатели смотрят',
      view: 'Участники пространства смотрят доску без правки',
      none: 'Доска открыта только её участникам и тем, кто управляет пространством',
    },
    loading: 'Загрузка…',
    cancel: 'Отмена',
    delete: 'Удалить',

    // ProjectBar
    projects: 'Проекты',
    allBoards: 'Все доски',
    noProject: 'Без проекта',
    projectName: 'Название проекта',
    newProject: 'Новый проект',
    projectMenu: (name: string) => `Меню проекта «${name}»`,
    projectActions: 'Действия с проектом',
    projectDeletion: 'Удаление проекта',
    deleteProjectQuestion: (name: string) =>
      `Удалить проект «${name}»? Его доски останутся в пространстве без проекта.`,
    project: (name: string) => `Проект «${name}»`,
    renameProject: 'Переименовать проект',
    deleteProject: 'Удалить проект',

    // WorkspaceAccessSection
    workspaceBoard: (name: ReactNode) => <>Доска пространства «{name}».</>,
    accessForMembers: 'Доступ участникам пространства',
    ownersAlwaysManage: 'Владельцы и администраторы пространства управляют ею всегда.',
    accessChangeFailed: 'Не удалось изменить доступ',

    // WorkspacePicker
    pickerHint:
      'Доска перейдёт команде со всем, что на ней есть, и участники пространства получат к ней доступ по своим ролям.',
    workspacesFailed: 'Не удалось загрузить пространства',
    noWorkspacesToPick: 'Нет пространств, где вы редактор или выше. Создайте пространство на главной странице.',
    workspaceForBoard: (title: string) => `Пространство для доски «${title}»`,

    // WorkspaceMembers
    lastOwner: 'В пространстве должен остаться владелец: сначала сделайте владельцем другого участника',
    membersLimit: (limit: number) => `В пространстве уже ${membersRu(limit)}`,
    membersChangeFailed: 'Не удалось изменить участников',
    members: 'Участники',
    leaveWorkspace: 'Покинуть пространство',
    leavingWorkspace: 'Уход из пространства',
    leave: 'Покинуть',
    leaveWarning: 'Вы потеряете доступ к доскам пространства, а доски, за которые вы отвечаете, перейдут его владельцу.',
    membersFailed: 'Не удалось загрузить участников',
    workspaceMembers: 'Участники пространства',
    you: ' (вы)',
    roleOf: (name: string) => `Роль: ${name}`,
    removeMember: (name: string) => `Убрать: ${name}`,
    removeFromWorkspace: 'Убрать из пространства',
    inviteByLink: 'Пригласить по ссылке',
    inviteHint:
      'Кто откроет ссылку-приглашение и войдёт через GitHub или Google, станет участником пространства с выбранной ролью и получит доступ к его доскам.',
    inviteRole: 'Роль приглашённых',
    createLink: 'Создать ссылку',
    inviteFailed: 'Не удалось создать приглашение',
    invitesLimit: (limit: number) =>
      `У пространства уже ${limit} ${pluralRu(limit, 'приглашение', 'приглашения', 'приглашений')} — отзовите ненужные`,
    invitesFailed: 'Не удалось загрузить приглашения',
    workspaceInvites: 'Приглашения в пространство',
    invitation: (role: string) => `Приглашение: ${role}`,
    inviteLink: 'Ссылка-приглашение',
    copied: 'Скопировано',
    copy: 'Копировать',
    revoke: 'Отозвать',

    // WorkspacesSection
    guestHint: 'Командные пространства с общими проектами доступны после входа через GitHub или Google.',
    signIn: 'Войти',
    workspaces: 'Пространства',
    workspaceName: 'Название пространства',
    createWorkspace: 'Создать пространство',
    createFailed: 'Не удалось создать пространство',
    workspacesLimit: (limit: number) =>
      `Можно состоять не больше чем в ${limit} ${pluralRu(limit, 'пространстве', 'пространствах', 'пространствах')}`,
    workspacesIntro: 'Пространство — общее место команды: проекты и доски, доступные всем её участникам по их ролям.',
    boards: boardsRu,
    membersCount: membersRu,
  },
  en: {
    roles: { owner: 'Owner', admin: 'Administrator', editor: 'Editor', viewer: 'Viewer' },
    accessOptions: {
      edit: { label: 'Edit', description: 'Workspace editors edit the board, viewers view it' },
      view: { label: 'View', description: 'All workspace members can only view the board' },
      none: {
        label: 'Invited only',
        description: 'The board is open to its members and to those who manage the workspace',
      },
    },
    accessOfOthers: {
      edit: 'Workspace editors edit the board, viewers view it',
      view: 'Workspace members view the board without editing',
      none: 'The board is open only to its members and to those who manage the workspace',
    },
    loading: 'Loading…',
    cancel: 'Cancel',
    delete: 'Delete',

    projects: 'Projects',
    allBoards: 'All boards',
    noProject: 'No project',
    projectName: 'Project name',
    newProject: 'New project',
    projectMenu: (name: string) => `Menu of the project “${name}”`,
    projectActions: 'Project actions',
    projectDeletion: 'Deleting the project',
    deleteProjectQuestion: (name: string) =>
      `Delete the project “${name}”? Its boards will stay in the workspace without a project.`,
    project: (name: string) => `Project “${name}”`,
    renameProject: 'Rename project',
    deleteProject: 'Delete project',

    workspaceBoard: (name: ReactNode) => <>A board of the workspace “{name}”.</>,
    accessForMembers: 'Access for workspace members',
    ownersAlwaysManage: 'Workspace owners and administrators always manage it.',
    accessChangeFailed: 'Could not change the access',

    pickerHint:
      'The board will go to the team with everything on it, and workspace members will get access to it by their roles.',
    workspacesFailed: 'Could not load the workspaces',
    noWorkspacesToPick: 'No workspaces where you are an editor or above. Create a workspace on the main page.',
    workspaceForBoard: (title: string) => `Workspace for the board “${title}”`,

    lastOwner: 'The workspace must keep an owner: first make another member an owner',
    membersLimit: (limit: number) => `The workspace already has ${membersEn(limit)}`,
    membersChangeFailed: 'Could not change the members',
    members: 'Members',
    leaveWorkspace: 'Leave workspace',
    leavingWorkspace: 'Leaving the workspace',
    leave: 'Leave',
    leaveWarning:
      'You will lose access to the boards of the workspace, and the boards you are responsible for will go to its owner.',
    membersFailed: 'Could not load the members',
    workspaceMembers: 'Workspace members',
    you: ' (you)',
    roleOf: (name: string) => `Role: ${name}`,
    removeMember: (name: string) => `Remove: ${name}`,
    removeFromWorkspace: 'Remove from the workspace',
    inviteByLink: 'Invite by link',
    inviteHint:
      'Whoever opens the invitation link and signs in with GitHub or Google becomes a member of the workspace with the chosen role and gets access to its boards.',
    inviteRole: 'Role of the invited',
    createLink: 'Create link',
    inviteFailed: 'Could not create the invitation',
    invitesLimit: (limit: number) =>
      `The workspace already has ${limit} ${pluralEn(limit, 'invitation', 'invitations')} — revoke the ones you do not need`,
    invitesFailed: 'Could not load the invitations',
    workspaceInvites: 'Workspace invitations',
    invitation: (role: string) => `Invitation: ${role}`,
    inviteLink: 'Invitation link',
    copied: 'Copied',
    copy: 'Copy',
    revoke: 'Revoke',

    guestHint: 'Team workspaces with shared projects are available after signing in with GitHub or Google.',
    signIn: 'Sign in',
    workspaces: 'Workspaces',
    workspaceName: 'Workspace name',
    createWorkspace: 'Create workspace',
    createFailed: 'Could not create the workspace',
    workspacesLimit: (limit: number) => `You can be a member of at most ${limit} ${pluralEn(limit, 'workspace', 'workspaces')}`,
    workspacesIntro: 'A workspace is the shared place of a team: projects and boards available to all its members by their roles.',
    boards: boardsEn,
    membersCount: membersEn,
  },
})
