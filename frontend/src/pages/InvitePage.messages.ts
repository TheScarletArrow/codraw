import { defineMessages, pluralEn, pluralRu } from '../i18n/i18n.ts'

/** The texts of the page that accepts an invitation to a board. */
export const inviteMessages = defineMessages({
  ru: {
    accepting: 'Принимаем приглашение…',
    invalid: 'Приглашение недействительно',
    invalidHint: 'Владелец доски отозвал эту ссылку-приглашение, или в ней ошибка. Попросите у него новую.',
    failed: 'Не удалось принять приглашение. Попробуйте ещё раз.',
    membersLimit: (limit: number) =>
      `На доске уже ${limit} ${pluralRu(limit, 'участник', 'участника', 'участников')}: владелец не может добавить больше.`,
    toBoards: 'К списку досок',
  },
  en: {
    accepting: 'Accepting the invitation…',
    invalid: 'The invitation is not valid',
    invalidHint: 'The owner of the board has revoked this invitation link, or it has a typo. Ask them for a new one.',
    failed: 'Could not accept the invitation. Please try again.',
    membersLimit: (limit: number) =>
      `The board already has ${limit} ${pluralEn(limit, 'member', 'members')}: the owner cannot add more.`,
    toBoards: 'Back to the boards',
  },
})
