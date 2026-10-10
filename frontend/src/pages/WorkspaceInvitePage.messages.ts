import { defineMessages, pluralEn, pluralRu } from '../i18n/i18n.ts'

/** The texts of the page that accepts an invitation to a workspace. */
export const workspaceInviteMessages = defineMessages({
  ru: {
    workspacesLimit: (limit: number) =>
      `Можно состоять не больше чем в ${limit} ${pluralRu(limit, 'пространстве', 'пространствах', 'пространствах')}: покиньте ненужное`,
    membersLimit: (limit: number) =>
      `В пространстве уже ${limit} ${pluralRu(limit, 'участник', 'участника', 'участников')}: больше добавить нельзя`,
    accepting: 'Принимаем приглашение…',
    signInRequired: 'Нужен вход',
    signInHint:
      'Командные пространства доступны после входа через GitHub или Google. Войдите и снова откройте ссылку-приглашение — ваши доски гостя останутся с вами.',
    withGithub: 'Войти через GitHub',
    withGoogle: 'Войти через Google',
    invalid: 'Приглашение недействительно',
    invalidHint:
      'Ссылку-приглашение отозвали, или в ней ошибка. Попросите новую у владельца или администратора пространства.',
    failed: 'Не удалось принять приглашение. Попробуйте ещё раз.',
    toBoards: 'К списку досок',
  },
  en: {
    workspacesLimit: (limit: number) =>
      `You can be a member of at most ${limit} ${pluralEn(limit, 'workspace', 'workspaces')}: leave one you do not need`,
    membersLimit: (limit: number) =>
      `The workspace already has ${limit} ${pluralEn(limit, 'member', 'members')}: no more can be added`,
    accepting: 'Accepting the invitation…',
    signInRequired: 'Sign-in required',
    signInHint:
      'Team workspaces are available after signing in with GitHub or Google. Sign in and open the invitation link again — your guest boards will stay with you.',
    withGithub: 'Sign in with GitHub',
    withGoogle: 'Sign in with Google',
    invalid: 'The invitation is not valid',
    invalidHint:
      'The invitation link has been revoked, or it has a typo. Ask the owner or an administrator of the workspace for a new one.',
    failed: 'Could not accept the invitation. Please try again.',
    toBoards: 'Back to the boards',
  },
})
