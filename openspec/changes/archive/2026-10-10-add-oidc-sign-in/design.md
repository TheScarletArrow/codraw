## Context

Вход устроен на `oauth2Login` Spring Security. Регистрации GitHub и Google задаёт Spring Boot из
`spring.security.oauth2.client.registration.*` (`application.yaml`), а без OAuth-приложений `docker-compose.prod.yml` и
профиль `dev` подставляют client id `not-configured`, и кнопки на странице входа ведут на ошибку провайдера. Профиль
читает `CodrawOAuth2UserService`: `ProviderProfile.of` превращает атрибуты GitHub или Google в
`provider`/`providerUserId`/имя/аватар, `UserService.signIn` делает upsert по уникальной паре
`users(provider, provider_user_id)` и переносит гостя, а в сеансе остаётся `DefaultOAuth2User` с одним атрибутом
`userId` (`UserPrincipal.kt`). Google подключён без `openid`, как обычный OAuth2, поэтому OIDC-ветка Spring Security
(`OidcUserService`, проверка ID-токена) сейчас не используется. Гость создаётся `POST /api/guest`, выход —
`POST /api/logout` с ответом 204. Фронтенд рисует на странице входа три кнопки без вопросов к `backend`.

## Goals / Non-Goals

**Goals:**

- Любой провайдер OpenID Connect (Keycloak, Entra ID, Okta, Authentik, Dex…) подключается настройками, без кода.
- Учётная запись надёжно связана с `iss` + `sub`; GitHub, Google, гости и их сеансы работают, как раньше.
- Закрытая установка: только корпоративный вход, без GitHub, Google и гостей.
- Интеграционный тест с настоящим сервером OIDC.

**Non-Goals:**

- SAML 2.0 и LDAP: Entra ID, Okta, Keycloak и ADFS все говорят OIDC, а SAML — отдельная библиотека и протокол.
- Связывание учётных записей разных провайдеров (GitHub и корпоративной) в одну и перенос досок между ними.
- Синхронизация пользователей (SCIM), роли и командные пространства из групп провайдера, back-channel logout.
- Хранение почты из claims и подстановка её в уведомления: адрес для писем пользователь подтверждает сам, как раньше.

## Decisions

### Настройки: `codraw.auth.oidc.<id>`

```yaml
codraw:
  auth:
    oidc:
      corp:                       # id: строчные латинские буквы и цифры, не github, google и guest
        issuer-uri: https://sso.example.com/realms/acme
        client-id: codraw
        client-secret: …
        name: Keycloak компании   # кнопка «Войти через Keycloak компании»; по умолчанию id
        scopes: openid,profile,email
        allowed-email-domains: example.com,example.org
        allowed-groups: codraw-users
        groups-claim: groups
        logout: false
```

`OidcProperties` — `@ConfigurationProperties("codraw.auth")` с `Map<String, OidcProvider>`. В окружении — 
`CODRAW_AUTH_OIDC_CORP_ISSUER_URI` и т. д.: так же Spring Boot сам связывает `SPRING_SECURITY_OAUTH2_CLIENT_REGISTRATION_<ID>_*`.
Поэтому id без дефисов и подчёркиваний. Провайдер без `issuer-uri` или `client-id` пропускается — так в
`docker-compose.prod.yml` можно перечислить переменные одного провайдера `corp` с пустыми значениями по умолчанию.
`openid` добавляется к scope, если его забыли: без него Spring Security не проверил бы ID-токен. Регистрация
получает `registrationId` = id, redirect `{baseUrl}/api/login/oauth2/code/{registrationId}`, `client_secret_basic`.
Неверный id (`github`, дефис, заглавные) — ошибка старта с понятным сообщением.

Альтернатива — настраивать провайдеров прямо в `spring.security.oauth2.client.*` и класть наши поля (название,
ограничения) рядом. Отклонена: оператору пришлось бы задавать `registration` и `provider` отдельно, а Spring Boot
читает метаданные `issuer-uri` при старте и не запустит `backend`, пока провайдер недоступен.

### Свой `ClientRegistrationRepository` и ленивое чтение метаданных

`CodrawClientRegistrations` заменяет репозиторий Spring Boot (тот отступает, `@ConditionalOnMissingBean`):

- GitHub и Google берутся из `OAuth2ClientProperties` через `OAuth2ClientPropertiesMapper`, но только с настоящим
  client id: пустой и `not-configured` значат «провайдер не настроен», и его регистрации нет — ни кнопки, ни адреса
  входа. Так закрытая установка выключает GitHub и Google, просто не задавая их приложения; `not-configured` уже
  используется в `docker-compose.prod.yml` и профиле `dev`.
- Провайдер OIDC строится при первом обращении: `ClientRegistrations.fromIssuerLocation(issuer)` читает
  `/.well-known/openid-configuration`, проверяет, что `issuer` в метаданных совпадает с заданным, и берёт адреса
  авторизации, токена, userinfo, JWKS и `end_session_endpoint`. Удача кэшируется навсегда (до перезапуска), неудача —
  нет: следующий вход попробует снова, а в журнал пишется предупреждение. Так недоступный провайдер не мешает
  `backend` стартовать, и GitHub, Google и гости работают.
- `SignInProviderFailureFilter` перед `OAuth2AuthorizationRequestRedirectFilter`: запрос
  `/api/oauth2/authorization/<id>` к выключенному провайдеру или к провайдеру OIDC, метаданные которого прочитать не
  удалось, отправляется на `/login?error`, а не получает 500 от фильтра Spring Security.

### Сервис пользователя OIDC и связь по `iss` + `sub`

Регистрации со scope `openid` Spring Security проводит через `oidcUserService`: обмен кода, проверка подписи
ID-токена по JWKS, `iss`, `aud`, срока и `nonce`, затем claims userinfo, если у провайдера есть его адрес.
`CodrawOidcUserService` берёт готовый `OidcUser` у `OidcUserService` и:

1. проверяет допуск (см. ниже);
2. строит `ProviderProfile("oidc:" + iss, sub, name, picture)`: `iss` — из проверенного ID-токена, `sub` — тоже;
3. вызывает `UserService.signIn(profile, previousUser)` — ту же функцию, что и для GitHub, с переносом гостя;
4. возвращает `DefaultOidcUser`, чей ID-токен — исходный, плюс claim `userId`, по которому назван principal. Сеанс
   тогда хранит id пользователя, как и для GitHub (`OAuth2User.userId` работает без изменений), и ID-токен для
   `id_token_hint` при выходе у провайдера.

**Миграции нет.** Пара `iss` + `sub` ложится в уже уникальную пару `users(provider, provider_user_id)`:
`provider = "oidc:<iss>"`, `provider_user_id = sub`. Префикс `oidc:` отделяет её от `github`, `google` и `guest` при
любом `iss`. Альтернатива — отдельный столбец `issuer` с новым ограничением уникальности — даёт то же, но требует
миграции, переписать upsert и пересоздать ограничение на большой таблице; отклонена как лишняя. Следствие: смена
issuer провайдера (например, нового адреса Keycloak) — это новые учётные записи; это свойство OIDC, а не наше, и
`docs/deploy.md` об этом предупреждает. Смена `id` провайдера в настройках учётные записи не теряет.

Имя: `name`, иначе `preferred_username`, `email`, `sub`; аватар: `picture`, только `http(s)` адрес. Почта и группы
используются только для проверки допуска и не хранятся.

### Ограничения допуска

- `allowed-email-domains`: claim `email` должен быть, домен после последнего `@` без учёта регистра — точно из
  списка (поддомены не считаются: их легко добавить списком, а лишний допуск хуже), `email_verified` не `false`.
  Отсутствующий `email_verified` не мешает: Entra ID его не отдаёт, а почту там задаёт администратор.
- `allowed-groups`: claim `groups-claim` (по умолчанию `groups`) — список строк или одна строка; хотя бы одна группа
  совпадает точно. Keycloak с «Full group path» отдаёт `/codraw-users`, без него — `codraw-users`; в `docs/deploy.md`
  пример без полного пути. Entra ID отдаёт id групп — их и нужно указывать.
- Отказ — `OAuth2AuthenticationException` с кодом `codraw_access_denied` до `signIn`, поэтому учётная запись не
  создаётся. Обработчик неудачи входа отправляет такой отказ на `/login?error=denied`, остальные — на `/login?error`,
  как раньше. Страница входа показывает «Вход в эту установку CoDraw вам не разрешён. Обратитесь к администратору».

### Способы входа: `GET /api/auth/providers`

Открыт без входа, отвечает `{"providers": [{"id": "github", "name": "GitHub"}, …, {"id": "corp", "name": "Keycloak
компании"}], "guests": true}` — GitHub и Google, если настроены, затем провайдеры OIDC в порядке настроек. Метаданные
провайдеров при этом не читаются. Страница входа рисует по ответу «Войти через <name>», пока ответа нет — ничего, без
способов входа — «Вход не настроен. Обратитесь к администратору». Первая кнопка — основная, остальные — `outline`.

### Гостевой вход выключается

`codraw.guests.enabled` (`CODRAW_GUESTS_ENABLED`, по умолчанию `true`) в существующих `GuestProperties`. Выключенный:
`POST /api/guest` без сеанса отвечает 403 и гостя не создаёт; запрос с уже действующим сеансом, как и раньше, — 204
без нового гостя. Уборка брошенных гостей не трогается: гости, созданные до выключения, доживают свой срок.

### Выход у провайдера

`logout: true` у провайдера. Обработчик успешного выхода смотрит на `OAuth2AuthenticationToken` выходящего: если его
регистрация — провайдер OIDC с `logout`, у метаданных есть `end_session_endpoint`, а principal — `OidcUser`, ответ —
200 `{"logoutUrl": "<end_session_endpoint>?id_token_hint=…&client_id=…&post_logout_redirect_uri=<baseUrl>/login"}`;
иначе 204, как раньше. Фронтенд после выхода переходит по `logoutUrl` (`window.location.assign`), а без него — на
`/login`. Адрес возврата строится от адреса запроса, как redirect URI входа, и его нужно разрешить у провайдера
(«Valid post logout redirect URIs» в Keycloak). Перенаправление 302 из самого `POST /api/logout` не подходит: его
делает `fetch`, а не браузер. По умолчанию выключено: оператору сначала нужно разрешить адрес возврата у провайдера.

### Политика конфиденциальности

`/api/legal` получает `signInProviders: [{name, corporate}]` и `guests`. Политика: «Учётная запись» называет
провайдеров установки; для корпоративных — что их выбрал оператор, что от них приходят идентификатор, имя, аватар,
почта и группы, а хранятся идентификатор с адресом провайдера, имя и аватар; почта и группы только проверяются. В
получателях — корпоративный провайдер узнаёт о входе и выходе по правилам оператора. Без корпоративного провайдера
текст прежний.

### Тест с настоящим сервером OIDC

`OidcLoginTest` поднимает Keycloak (`keycloak/keycloak` с Docker Hub) в Testcontainers с двумя realm из
`src/test/resources/keycloak/` и идёт полным кодом авторизации: `GET /api/oauth2/authorization/corp` через MockMvc →
форма входа Keycloak через `java.net.http.HttpClient` с cookie → `code` и `state` → обратный вызов в MockMvc с тем же
сеансом. `backend` сам меняет код на токены у Keycloak и проверяет ID-токен. Сценарии: первый вход создаёт учётную
запись; после смены почты и имени через admin API Keycloak вход находит ту же учётную запись; второй realm — другой
issuer — другая учётная запись; ограничения домена и группы; выход у провайдера.

mock-oauth2-server (navikt) легче, но его образ лежит только в `ghcr.io`, а в песочнице разработки он недоступен;
Keycloak с Docker Hub качается и здесь, и в GitHub Actions и заодно проверяет пример из `docs/deploy.md`. Одинаковый
`sub` у двух realm Keycloak не сделать (id пользователей у него общие для всех realm), поэтому сценарий «одинаковый
`sub` у разных issuer» дополнительно проверяет `OidcUserServiceTest` с подставленными claims.

### ADR

ADR-0010 «Корпоративный вход через OpenID Connect»: OIDC вместо SAML, связь по `iss` + `sub`, ленивые метаданные.
Новой библиотеки нет — OIDC уже в `spring-boot-starter-security-oauth2-client`, Keycloak — только образ для тестов.

## Risks / Trade-offs

- [Провайдер недоступен во время входа] → вход через него не работает, остальные способы входа работают; кнопка
  возвращает на страницу входа с ошибкой, в журнале — предупреждение с причиной.
- [Метаданные кэшируются до перезапуска] → смена ключей провайдера на это не влияет (JWKS Spring Security читает по
  `kid` сам), но смена адресов провайдера требует перезапуска `backend`; это редкость и описано в `docs/deploy.md`.
- [Смена issuer у провайдера] → новые учётные записи; доски старых можно передать только вручную. Предупреждение в
  `docs/deploy.md`.
- [ID-токен в сеансе] → сеанс в `spring_session_attributes` хранит ID-токен корпоративного пользователя (обычно
  до пары КБ) для `id_token_hint`; он и так прошёл через браузер, а сеанс доступен только `backend`.
- [Entra ID multi-tenant `/common`] → issuer в метаданных — шаблон, и проверка совпадения не пройдёт; поддерживается
  только issuer конкретного каталога (`https://login.microsoftonline.com/<tenant>/v2.0`), это сказано в документации.

## Migration Plan

Миграции базы нет. Установки с GitHub и Google продолжают работать без изменений настроек; установки без
OAuth-приложений (`not-configured`) теряют неработающие кнопки GitHub и Google. Откат — прежний образ `backend`:
учётные записи `oidc:…` остаются в таблице, но войти в них нельзя, пока корпоративный вход не вернут.
