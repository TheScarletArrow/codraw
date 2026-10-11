# Безопасность CoDraw

## Как сообщить об уязвимости

**Не открывайте публичный issue, обсуждение или pull request** с описанием уязвимости: репозиторий публичный, и
описание увидят все раньше, чем выйдет исправление.

Сообщите приватно через GitHub: вкладка **Security** репозитория → **Report a vulnerability**
(<https://github.com/TheScarletArrow/codraw/security/advisories/new>). Сообщение увидят только сопровождающие проекта.

Чтобы мы быстрее воспроизвели проблему, укажите:

- какая часть затронута (`backend`, `collab`, `frontend`, образ, конфигурация развёртывания) и версия или коммит;
- шаги воспроизведения и что получает злоумышленник: чьи данные, какие права, нужна ли учётная запись или роль на доске;
- предложение по исправлению, если оно есть.

Проверяйте только на своей установке и своих учётных записях: не трогайте чужие данные и чужие установки CoDraw.

## Что будет дальше

- Ответим в течение 7 дней и скажем, подтверждена ли уязвимость.
- Исправление готовим в приватном форке рекомендации (security advisory) и выпускаем новыми образами `latest`.
- После выпуска публикуем рекомендацию с описанием и благодарностью автору, если он не против.

## Поддерживаемые версии

Исправления выходят только для последней версии: ветки `main` и образов `ghcr.io/thescarletarrow/codraw-*:latest`.
Обновите установку по [docs/deploy.md](docs/deploy.md), прежде чем сообщать о проблеме.

## Проверки в репозитории

Что проверяется автоматически на каждом пуше — CodeQL, сканирование образов, аудит зависимостей и обновления
Dependabot, — описано в [docs/security.md](docs/security.md).

---

## Reporting a vulnerability (English)

Please **do not** open a public issue, discussion or pull request for a security problem. Report it privately through
GitHub: **Security** tab → **Report a vulnerability**
(<https://github.com/TheScarletArrow/codraw/security/advisories/new>). Include the affected component and version, the
steps to reproduce and the impact. We answer within 7 days, fix the problem in a private advisory and publish it once the
new images are released. Only the latest version (`main` and the `latest` images) receives fixes.
