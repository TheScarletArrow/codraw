import { defineMessages } from '../i18n/i18n.ts'

export const embedMessages = defineMessages({
  ru: {
    liveImage: 'Живая картинка',
    liveOn: 'Картинка страницы обновляется после правок. Её видит любой, у кого есть ссылка, даже если доступ к доске закрыт.',
    liveOff: 'Ссылка на картинку страницы, которая обновляется после правок: для README, вики и задач.',
    page: 'Страница',
    imagePage: 'Страница картинки',
    imageLink: 'Ссылка на картинку',
    copied: 'Скопировано',
    copyLink: 'Копировать ссылку',
    copyMarkdown: 'Копировать Markdown',
    changeFailed: 'Не удалось изменить живую картинку',
  },
  en: {
    liveImage: 'Live image',
    liveOn: 'The image of the page is updated after edits. Anyone with the link can see it, even if the board is not shared with them.',
    liveOff: 'A link to an image of the page that is updated after edits: for READMEs, wikis and tasks.',
    page: 'Page',
    imagePage: 'Page of the image',
    imageLink: 'Image link',
    copied: 'Copied',
    copyLink: 'Copy link',
    copyMarkdown: 'Copy Markdown',
    changeFailed: 'Could not change the live image',
  },
})
