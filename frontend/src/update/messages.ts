import { defineMessages } from '../i18n/i18n.ts'

/** The texts of the banner of a new version of CoDraw and of the page that did not load after a deployment. */
export const updateMessages = defineMessages({
  ru: {
    available: 'Вышла новая версия CoDraw',
    newerDocument: 'Доска сохранена новой версией CoDraw — обновите страницу, чтобы её править',
    reload: 'Обновить',
    later: 'Позже',
    saving: 'Сохраняем правки…',
    unsaved: 'Не все правки сохранены: обновите страницу, когда появится связь, иначе они пропадут',
    reloadAnyway: 'Обновить всё равно',
    offline: 'Нет связи: обновите страницу, когда она появится — без связи страница не откроется',
    staleTitle: 'CoDraw обновился',
    staleText:
      'Эта вкладка открыта со старой версией, и часть приложения не загрузилась. Обновите страницу — изменения на досках сохраняются сами.',
    offlineTitle: 'Нет связи',
    offlineText: 'Страница не загрузилась: нет связи с сервером. Она загрузится сама, когда связь появится.',
    reloading: 'Загружаем новую версию…',
    reloadPage: 'Обновить страницу',
  },
  en: {
    available: 'A new version of CoDraw is out',
    newerDocument: 'This board is saved by a newer version of CoDraw — reload the page to edit it',
    reload: 'Reload',
    later: 'Later',
    saving: 'Saving the edits…',
    unsaved: 'Some edits are not saved: reload the page once the connection is back, or they will be lost',
    reloadAnyway: 'Reload anyway',
    offline: 'No connection: reload the page once it is back — without one the page will not open',
    staleTitle: 'CoDraw has been updated',
    staleText:
      'This tab runs an earlier version, and a part of the app did not load. Reload the page — the changes on boards are saved by themselves.',
    offlineTitle: 'No connection',
    offlineText: 'The page did not load: there is no connection to the server. It will load by itself once the connection is back.',
    reloading: 'Loading the new version…',
    reloadPage: 'Reload the page',
  },
})
