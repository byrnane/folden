# Repository settings

[repository-settings.json](repository-settings.json) describes the intended GitHub settings for `byrnane/folden`. Compare it with the current settings before applying changes.

## Repository and security

- Apply `repository` with `PATCH /repos/byrnane/folden` and `topics` with `PUT /repos/byrnane/folden/topics` using the `names` field.
- Apply `branch_protection` with `PUT /repos/byrnane/folden/branches/master/protection`. Check the CI job names before making them required. Keep `enforce_admins` set to `false` so the owner can manage the repository.
- Enable private vulnerability reporting with `PUT /repos/byrnane/folden/private-vulnerability-reporting`. Confirm that `GET` on the same endpoint returns `enabled: true`.
- Enable secret scanning and push protection where GitHub offers them. Check that both are enabled in `security_and_analysis`; missing or null fields leave their status unverified.

## Release draft

Use `release_environment` for the `release-draft` environment. Replace each reviewer's `login` with their numeric GitHub user `id` before calling `PUT /repos/byrnane/folden/environments/release-draft`. Allow tags matching `v*` and keep self-review available for the owner. GitHub's environment features depend on the account and repository settings.

Run **Draft beta release** on the version tag and pass that same tag as the `tag` input. The environment rule checks the run's `GITHUB_REF`. See [GitHub's branch and tag rules](https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments#deployment-branches-and-tags). Confirm that the owner can approve the draft job and candidate branch pushes only produce workflow artifacts.

## Public presentation

Use [social-preview.png](../docs/assets/social-preview.png) for the repository preview. It is 1280 × 640. Check the README, release links, license display and images on GitHub. In the README, explain the permission to read and inspect the source and make private Linux builds under [LICENSE.md](../LICENSE.md).

## Настройки репозитория

[repository-settings.json](repository-settings.json) описывает нужные настройки GitHub для `byrnane/folden`. Перед изменением сравните их с текущими.

- Примените `repository` через `PATCH /repos/byrnane/folden`, а `topics` через `PUT /repos/byrnane/folden/topics` с полем `names`.
- Примените `branch_protection` через `PUT /repos/byrnane/folden/branches/master/protection`. Проверьте названия задач CI перед добавлением обязательных проверок. Оставьте `enforce_admins: false`, чтобы владелец мог управлять репозиторием.
- Включите приватные сообщения об уязвимостях через `PUT /repos/byrnane/folden/private-vulnerability-reporting`. Убедитесь, что `GET` по тому же адресу возвращает `enabled: true`.
- Включите secret scanning и push protection, если GitHub их предлагает. Проверьте статус обеих функций в `security_and_analysis`. Пустые или отсутствующие поля не подтверждают, что функции включены.

Для environment `release-draft` используйте `release_environment`. Перед вызовом `PUT /repos/byrnane/folden/environments/release-draft` замените `login` каждого проверяющего на числовой GitHub `id`. Разрешите теги `v*` и оставьте владельцу возможность подтвердить собственный запуск. Доступность функций environment зависит от аккаунта и настроек репозитория.

Запускайте **Draft beta release** на теге версии и передавайте этот же тег в поле `tag`. Правило environment проверяет `GITHUB_REF` запуска; подробности есть в [документации GitHub](https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments#deployment-branches-and-tags). Убедитесь, что владелец может подтвердить создание черновика, а push в ветку кандидата создаёт только артефакты workflow.

Для превью репозитория используйте [social-preview.png](../docs/assets/social-preview.png), 1280 × 640. Проверьте README, ссылки на релизы, отображение лицензии и изображения на GitHub. В README объясните условия чтения и изучения исходников и самостоятельной Linux-сборки по [LICENSE.md](../LICENSE.md).
