## Context

Вход устроен на `oauth2Login` Spring Security. GitHub и Google — регистрации Spring Boot из
`spring.security.oauth2.client.registration.*` (`application.yaml`); `CodrawClientRegistrations` берёт из них только
те, у которых настоящий client id (не пустой и не `not-configured`), и добавляет корпоративных провайдеров OIDC из
`codraw.auth.oidc`. Профиль читает `CodrawOAuth2UserService`: `DefaultOAuth2UserService` загружает атрибуты, а
`ProviderProfile.of` превращает их в `provider`/`providerUserId`/имя/аватар; `UserService.signIn` делает upsert по
`users(provider, provider_user_id)` и переносит гостя. Страница входа рисует кнопки по `GET /api/auth/providers`,
политика конфиденциальности называет провайдеров по `/api/legal`.

Яндекс ID и VK ID — OAuth-провайдеры со своими особенностями:

- **Яндекс ID** — OAuth 2.0: `https://oauth.yandex.ru/authorize`, `https://oauth.yandex.ru/token`, профиль
  `https://login.yandex.ru/info?format=json`, документация которого передаёт токен заголовком
  `Authorization: OAuth <токен>`. Права приложения задаются при регистрации; `login:info` — логин, имя, фамилия, пол,
  `login:avatar` — портрет, `login:email` — почта.
- **VK ID** — OAuth 2.1 на `id.vk.ru` (ВКонтакте перевела авторизацию на домен `vk.ru`): `/authorize`,
  обмен кода `POST /oauth2/auth`, профиль `POST /oauth2/user_info`. PKCE обязателен (S256), секрет приложения при
  обмене не нужен — веб-SDK VK ID меняет код прямо в браузере. Обратный вызов кроме `code` и `state` несёт `device_id`,
  без которого код не обменять. Профиль приходит внутри `user`: `user_id`, `first_name`, `last_name`, `avatar` и,
  с правом `vkid.personal_info`, пол и дата рождения.

## Goals / Non-Goals

**Goals:**

- Яндекс ID и VK ID включаются настройками, как GitHub и Google; без них кнопок нет.
- Учётная запись надёжно связана с id пользователя у провайдера; гости, блокировка, удаление и администраторы работают,
  как для GitHub.
- Политика конфиденциальности честно говорит, что приходит от этих провайдеров и что хранится.
- Тест полного входа с поддельными серверами провайдеров, которые проверяют запросы `backend` так, как их требует
  провайдер.

**Non-Goals:**

- Госуслуги (ЕСИА), Сбер ID и T-ID: подключение требует договора с владельцем сервиса или регистрации в ЕСИА,
  сертификатов и подписи запросов (в ЕСИА — ГОСТ); это работа под конкретную установку, а не настройка.
- Отдельные кнопки Mail и Одноклассников через VK ID (параметр `provider` окна VK ID): VK ID документирует их для своего
  SDK, а не для серверного входа; можно добавить позже тем же клиентом.
- Почта из Яндекс ID и VK ID: адрес для писем пользователь подтверждает сам, как раньше (ADR-0008).
- Выход у провайдера: как у GitHub и Google, «Выйти» завершает только сеанс CoDraw.
- Связывание учётных записей разных провайдеров в одну.

## Decisions

### Регистрации Spring Boot, а не свои настройки

`yandex` и `vk` — регистрации и провайдеры в `spring.security.oauth2.client` в `application.yaml`, как GitHub и Google:

```yaml
registration:
  yandex:
    client-id: ${YANDEX_CLIENT_ID:not-configured}
    client-secret: ${YANDEX_CLIENT_SECRET:not-configured}
    client-name: Яндекс ID
    client-authentication-method: client_secret_post
    scope: login:info,login:avatar
  vk:
    client-id: ${VK_CLIENT_ID:not-configured}
    client-name: VK ID
    client-authentication-method: none
    scope: vkid.personal_info
provider:
  yandex: { authorization-uri, token-uri, user-info-uri: https://login.yandex.ru/info?format=json, user-name-attribute: id }
  vk: { authorization-uri, token-uri, user-info-uri, user-info-authentication-method: form, user-name-attribute: user_id }
```

Оператор задаёт только `YANDEX_CLIENT_ID` и `YANDEX_CLIENT_SECRET` или `VK_CLIENT_ID` — как `GITHUB_*`. Адреса
провайдеров тоже настройки, поэтому тесты подменяют их поддельными серверами, а при новой смене домена VK их можно
переопределить без нового образа. `CodrawClientRegistrations` уже пропускает регистрации с `not-configured` и только
дополняет список провайдеров страницы входа: GitHub, Google, Яндекс ID, VK ID, затем корпоративные.

Права Яндекса перечислены явно: без `scope` Яндекс выдал бы все права приложения, в том числе почту, если оператор её
отметил. VK ID — публичный клиент (`none`): Spring Security для него сам добавляет PKCE с S256 и шлёт `client_id` в теле
обмена кода, а секрета оператору задавать не нужно.

Альтернатива — подключать их как корпоративных провайдеров OIDC (`codraw.auth.oidc`). Не подходит: Яндекс ID — OAuth
2.0 без ID-токена, а VK ID требует `device_id` при обмене кода и отдаёт профиль не по стандарту userinfo.

### Особенности VK ID в запросах

- **`state`.** VK ID принимает `state` не короче 32 символов из букв, цифр, `_` и `-`, а Spring Security делает его
  Base64 URL с `=` на конце. `DefaultOAuth2AuthorizationRequestResolver` получает customizer, который ставит `state` из
  32 случайных байт в Base64 URL без `=` (43 символа) — для всех провайдеров: им формат безразличен, а одно правило
  проще.
- **`device_id` и `state` в обмене кода.** `RestClientAuthorizationCodeTokenResponseClient` с дополнительным
  конвертером параметров: для `vk` он добавляет `device_id` из запроса обратного вызова (`RequestContextHolder`: обмен
  кода идёт в том же запросе, а `RequestContextFilter` Spring Boot стоит раньше фильтров безопасности) и `state` из
  сохранённого запроса авторизации, как делает SDK VK ID. Без `device_id` VK ID откажет, и вход вернётся на страницу
  входа с ошибкой.
- **Профиль.** `DefaultOAuth2UserService` получает конвертер запроса и конвертер атрибутов по `registrationId`: для
  `vk` — `POST` формой с `access_token` и `client_id`, ответ разворачивается из `user`, а ответ без `user` (например,
  ошибка VK ID) — `OAuth2AuthenticationException`, то есть возврат на страницу входа, а не 500; для `yandex` — `GET` с
  `Authorization: OAuth <токен>`, как в документации Яндекса; остальные — как раньше.

### Профиль и учётная запись

`ProviderProfile.of`:

- `yandex`: id — `id`; имя — `real_name`, иначе `display_name`, `login`, `id`; аватар —
  `https://avatars.yandex.net/get-yapic/<default_avatar_id>/islands-200`, если `default_avatar_id` есть, а
  `is_avatar_empty` не `true`.
- `vk`: id — `user_id`; имя — `first_name` и `last_name` через пробел, иначе `user_id`; аватар — `avatar`, только
  `http(s)`.

`users.provider` = `yandex` или `vk`, `provider_user_id` — id у провайдера: уникальная пара уже есть, миграции нет.
Пол, дата рождения и логин не хранятся. `AdminProperties` принимает `yandex:<id>` и `vk:<user_id>`; `OidcProperties`
не даёт занять id `yandex` и `vk` корпоративным провайдером, иначе две регистрации делили бы один адрес возврата.

### Названия на странице входа и в политике

`GET /api/auth/providers` и `/api/legal` отдают названия «Яндекс ID» и «VK ID»; `/api/legal` — теперь и id каждого
провайдера. Фронтенд называет встроенных провайдеров по языку интерфейса из своего словаря (`yandex` — «Яндекс ID» или
«Yandex ID»), а остальных — названием из ответа. Так английский интерфейс не показывает кириллицу, а корпоративный
провайдер остаётся с названием оператора.

Политика: в «Учётная запись» общий текст для GitHub, Google, Яндекс ID и VK ID (имя, картинка, идентификатор, почта не
запрашивается) дополняется фразой, что Яндекс ID присылает вместе с ними логин и пол, а VK ID — пол и дату рождения, и
CoDraw их не хранит; фраза есть, только если такой провайдер включён. Повторный вход после
удаления учётной записи и «Кому передаются данные» называют провайдеров по списку установки, как раньше. Условия
использования и подсказки гостю говорят «после входа» без названий провайдеров.

### Тест с поддельными провайдерами

`FakeSignInProviders` (как `FakeGitHub`) — HTTP-сервер на этой машине с обменом кода и профилем обоих провайдеров;
`IntegrationTest` направляет на него `token-uri` и `user-info-uri` `yandex` и `vk`, а адреса авторизации остаются
настоящими: тест не ходит по ним, а сразу вызывает обратный вызов. Сервер проверяет то, что проверяет провайдер: у VK ID
— `device_id`, `state`, `client_id`, `code_verifier` под `code_challenge` из адреса авторизации, отсутствие секрета, а
профиль — `POST` с `client_id`; у Яндекса — секрет в теле и заголовок `OAuth`. Тест входит MockMvc полным кодом
авторизации и проверяет учётную запись, имя, аватар, повторный вход и ошибку без `device_id`.

### ADR

ADR-0015 «Вход через Яндекс ID и VK ID»: регистрации Spring Boot, VK ID как публичный клиент с PKCE, что не
подключаем (Госуслуги, Сбер ID, T-ID) и почему.

## Risks / Trade-offs

- [VK ID или Яндекс изменят адреса или правила, как VK сменил домен на `vk.ru`] → адреса — настройки
  (`SPRING_SECURITY_OAUTH2_CLIENT_PROVIDER_VK_TOKEN_URI` и т. д.), их можно поменять без нового образа; при отказе
  провайдера вход возвращает на страницу входа с ошибкой, а причина — в журнале `backend`.
- [Поддельный сервер в тестах повторяет наше понимание протокола] → он следует документации и SDK провайдеров; ручная
  проверка с настоящими приложениями описана в `docs/deploy.md`.
- [`device_id` берётся из текущего запроса через `RequestContextHolder`] → обмен кода всегда идёт в запросе обратного
  вызова; без запроса параметр просто не добавится, и VK ID откажет — вход не выполнится, но и не войдёт чужой.
- [Пользователь одного человека в Яндексе и в VK — разные учётные записи CoDraw] → так же, как GitHub и Google;
  связывание — вне этого изменения.

## Migration Plan

Миграции базы нет. Установки без `YANDEX_*` и `VK_CLIENT_ID` работают как раньше и кнопок не получают. Откат — прежний
образ `backend`: учётные записи `yandex` и `vk` остаются в таблице, но войти в них нельзя, пока вход не вернут.
