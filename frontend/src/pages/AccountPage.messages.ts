import { defineMessages, pluralEn, pluralRu } from '../i18n/i18n.ts'

/** The texts of «Учётная запись»: downloading the data of the user and deleting the account. */
export const accountMessages = defineMessages({
  ru: {
    /** The word that confirms the deletion. */
    confirmationWord: 'удалить',
    title: 'Учётная запись',
    intro: 'Ваши данные в CoDraw: скачайте их или удалите учётную запись.',
    myData: 'Мои данные',
    archive:
      'Архив ZIP: профиль, ваши доски в формате draw.io с изображениями, комментарии, реакции, решения, предложения, библиотеки фигур, шаблоны, папки и теги, участие в досках и пространствах, настройки уведомлений — в JSON.',
    building: 'Собираем архив…',
    download: 'Скачать мои данные',
    tooManyDownloads: 'Слишком много выгрузок за сутки. Попробуйте позже.',
    downloadFailed: 'Не удалось собрать архив. Попробуйте ещё раз.',
    deletion: 'Удаление учётной записи',
    deletionText: (github: boolean) =>
      `Удаление необратимо. Удаляются профиль, ваши доски без других участников и доски в корзине с изображениями, участие в досках и пространствах, библиотеки фигур, шаблоны, папки, теги, уведомления и их настройки${github ? ', подключение GitHub' : ''}. Ваши комментарии, решения и правки на досках других людей остаются с подписью «Удалённый пользователь». Все сеансы завершаются.`,
    githubToken: 'Токен GitHub CoDraw удалит у себя; отозвать его можно в настройках GitHub.',
    loading: 'Загрузка…',
    previewFailed: 'Не удалось узнать, что станет с вашими досками',
    deletedBoards: (count: number) => `Удалятся досок без других участников и из корзины: ${count}.`,
    noDeletedBoards: 'Досок без других участников у вас нет.',
    blockingWorkspaces:
      'Вы единственный владелец пространств, где есть другие участники. Сначала передайте роль владельца:',
    sharedBoards: 'С этими досками работают другие люди. Решите, что с ними будет:',
    confirm: (word: string) => `Чтобы подтвердить, введите слово «${word}»`,
    deleteAccount: 'Удалить учётную запись',
    choose: 'Выберите…',
    transfer: (name: string) => `Передать: ${name}`,
    deleteBoard: 'Удалить доску',
    visitorsOnly: (visitors: number) =>
      `Доску открывали по ссылке (${visitors}). Передать её можно только участнику: добавьте человека в участники в окне «Поделиться».`,
    ownerLimit: (limit: number) =>
      `У нового владельца уже ${limit} ${pluralRu(limit, 'доска', 'доски', 'досок')} — больше нельзя. Выберите другого участника или удалите доску.`,
    changed: 'Пока вы решали, что-то изменилось. Проверьте доски и пространства ещё раз.',
    deletionFailed: 'Не удалось удалить учётную запись. Попробуйте ещё раз.',
  },
  en: {
    confirmationWord: 'delete',
    title: 'Account',
    intro: 'Your data in CoDraw: download it or delete the account.',
    myData: 'My data',
    archive:
      'A ZIP archive: the profile, your boards in the draw.io format with images, comments, reactions, decisions, proposals, shape libraries, templates, folders and tags, membership in boards and workspaces, notification settings — in JSON.',
    building: 'Building the archive…',
    download: 'Download my data',
    tooManyDownloads: 'Too many downloads today. Try again later.',
    downloadFailed: 'Could not build the archive. Please try again.',
    deletion: 'Deleting the account',
    deletionText: (github: boolean) =>
      `Deletion cannot be undone. Deleted are the profile, your boards without other members and the boards in the trash with images, membership in boards and workspaces, shape libraries, templates, folders, tags, notifications and their settings${github ? ', the GitHub connection' : ''}. Your comments, decisions and edits on other people’s boards stay, signed “Deleted user”. All sessions end.`,
    githubToken: 'CoDraw deletes the GitHub token on its side; you can revoke it in the GitHub settings.',
    loading: 'Loading…',
    previewFailed: 'Could not find out what becomes of your boards',
    deletedBoards: (count: number) => `Boards without other members and in the trash to be deleted: ${count}.`,
    noDeletedBoards: 'You have no boards without other members.',
    blockingWorkspaces:
      'You are the only owner of workspaces that have other members. First hand the owner role over:',
    sharedBoards: 'Other people work with these boards. Decide what becomes of them:',
    confirm: (word: string) => `To confirm, type the word “${word}”`,
    deleteAccount: 'Delete account',
    choose: 'Choose…',
    transfer: (name: string) => `Hand over to: ${name}`,
    deleteBoard: 'Delete board',
    visitorsOnly: (visitors: number) =>
      `The board was opened by link (${visitors}). It can be handed over only to a member: add the person as a member in the “Share” window.`,
    ownerLimit: (limit: number) =>
      `The new owner already has ${limit} ${pluralEn(limit, 'board', 'boards')}, no more are allowed. Choose another member or delete the board.`,
    changed: 'Something changed while you were deciding. Check the boards and workspaces again.',
    deletionFailed: 'Could not delete the account. Please try again.',
  },
})
