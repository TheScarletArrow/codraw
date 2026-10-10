import { defineMessages } from '../i18n/i18n.ts'

export const offlineMessages = defineMessages({
  ru: {
    reasons: {
      'no-edit-right': 'Правки, сделанные без связи, не отправлены: у вас больше нет права правки',
      kept: 'Неотправленные правки остались в копии доски на этом устройстве',
    },
    confirmDelete: 'Удалить копию? Правки из неё пропадут.',
    cancel: 'Отмена',
    delete: 'Удалить',
    download: 'Скачать копию (.drawio)',
    deleteFromDevice: 'Удалить копию с устройства',
    readFailed: 'Не удалось прочитать копию',
  },
  en: {
    reasons: {
      'no-edit-right': 'Edits made offline were not sent: you no longer have the right to edit',
      kept: 'Unsent edits remain in the copy of the board on this device',
    },
    confirmDelete: 'Delete the copy? Its edits will be lost.',
    cancel: 'Cancel',
    delete: 'Delete',
    download: 'Download the copy (.drawio)',
    deleteFromDevice: 'Delete the copy from the device',
    readFailed: 'Could not read the copy',
  },
})
