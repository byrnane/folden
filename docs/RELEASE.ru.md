# Подготовка релиза

[English](RELEASE.md)

Folden 0.12 — бета. Workflow готовит **черновик prerelease** для проверки владельцем. Публикация, замена публичной истории, создание тега и обновление установленного приложения требуют отдельного решения владельца.

## Пакеты

| Платформа           | Runner         | Пакет     |
| ------------------- | -------------- | --------- |
| Windows x64         | Windows 2022   | NSIS .exe |
| macOS Intel         | macOS 15 Intel | .dmg      |
| macOS Apple Silicon | macOS 15 ARM   | .dmg      |

Минимальная macOS — 14. Windows требует WebView2; установщик может загрузить runtime Microsoft. Windows-бета не подписана, macOS имеет ad-hoc подпись без notarization. Матрица задаёт поддерживаемые системы, но не подтверждает пройденный native smoke.

Linux не входит в официальные пакеты и приёмку беты. [Приватная самостоятельная сборка](DEVELOPMENT.ru.md#самостоятельная-сборка-на-linux) сохраняет поддержку Linux-исходников и notices зависимостей без обещания официальных пакетов.

## Проверки

Зафиксированы Node 24.16.0 и Rust 1.96.0. Из корня:

```text
npm ci
npm run quality
npm run test:release
npm run privacy:check
npm run test:coverage
npm run test:e2e
npm run test:performance
```

Из корня создайте и проверьте notices. Генератор загружает исходники из Cargo.lock, получает платформенные графы зависимостей, включая самостоятельные Linux-сборки, и проверяет upstream license inputs. Сгенерированные документы входят в пакеты, но не коммитятся:

```text
npm run licenses:generate
npm run licenses:check
```

Из src-tauri:

```text
cargo fmt --check
cargo clippy --locked --all-targets -- -D warnings
cargo test --locked
```

Пакет собирается на соответствующей ОС:

```text
npm run release:build -- --target x86_64-pc-windows-msvc
npm run release:verify -- --target x86_64-pc-windows-msvc
```

Для macOS используйте x86_64-apple-darwin или aarch64-apple-darwin в зависимости от архитектуры. Проверяется распакованный **финальный пакет**: версия, архитектура, лицензии и приватные данные. В публикацию попадают только предусмотренные форматы и SHA256SUMS.txt. Source maps, дампы, логи, локальные пути и старые smoke-установщики блокируют проверку.

THIRD_PARTY_NOTICES.md содержит консервативный npm/Cargo inventory с runtime/build scopes. Windows distribution также содержит неизменённый corresponding source archive NSIS 3.11, nsis-3.11-src.tar.bz2, с зафиксированным SHA-256 в общем checksum. Это сопроводительные исходники по условиям NSIS/LZMA, а не установочный пакет. Проверки Linux payload сохраняются в release scripts, но Linux-пакеты не входят в официальные artifacts этой беты.

## Кандидат и черновик

CI запускается для master/main и PR. Package workflow проверяет и собирает ветки release/beta-*. Push в такую ветку создаёт только workflow artifacts.

После проверки очищенного дерева/истории и отдельного разрешения на push проверьте CI и native gates на точном commit. Перед заменой публичной истории сохраните проверенные Git/source backups; проверяйте metadata авторов и все доступные ветки/теги. Замена истории не удаляет уже скачанные копии и сторонние кеши.

После разрешения создайте v0.12.0 на проверенном commit и вручную запустите **Draft beta release**, выбрав tag и как workflow ref, и как input. Доступность кнопки dispatch в UI зависит от workflow на default branch. Candidate push запускает и регистрирует workflow; после этого используйте CLI/API с точным согласованным tag как ref, если кнопка недоступна: `gh workflow run release.yml --ref v0.12.0 -f tag=v0.12.0 -F create_draft=true`. Если GitHub отказывает в dispatch, сохраните candidate artifacts для review, не меняя публичную историю ради кнопки. create_draft по умолчанию false. Только завершающий job имеет contents:write: он создаёт draft prerelease, отказывается заменять существующий релиз и не публикует его. Сначала настройте обязательное подтверждение владельца для environment release-draft.

Перед публикацией проверьте три пакета, общий checksum, лицензии и [release notes](releases/v0.12.0.md), а также native acceptance Windows и macOS: чистый запуск, save/reopen, RU/EN, recovery/conflicts, изображения/ссылки, печать, install/update/uninstall. Результаты фиксируются в [BETA-0.12.0.ru.md](BETA-0.12.0.ru.md). Browser mocks не доказывают работу системных диалогов и установщика.

Dispatch собирает новые пакеты: перед публикацией native acceptance нужно провести на **финальных файлах черновика**, даже если предыдущий candidate прошёл проверку. Чтобы сохранить уже принятые candidate files, скачайте три artifacts точного run в `build/release/folden-<target>/` чистого checkout проверенного commit. После согласования тега задайте `RELEASE_TAG=v0.12.0` и `RELEASE_COMMIT=<tested SHA>`, затем выполните `node scripts/release-draft.mjs`. Скрипт сверяет canonical names, каждый checksum, legal resources, чистый checkout и точный remote tag commit; копирует принятые байты без rebuild и создаёт только draft prerelease. Публикуйте именно native-accepted files.

## Настройки репозитория

[Payload](../.github/repository-settings.json) и [инструкция](../.github/REPOSITORY_SETUP.md) описывают настройки. Metadata, темы, private vulnerability reporting, secret scanning, push protection и environment release-draft применены и проверены 2026-10-02. Защита ветки откладывается до отдельно согласованной замены публичной истории. Замена истории, commits, push, tags и публикация согласуются отдельно.

Официальные бинарники бесплатны для личной и коммерческой работы. Авторские исходники доступны для ознакомления с ограниченным разрешением на приватную Linux-сборку по [LICENSE.md](../LICENSE.md). Права на пользовательские документы и сторонние компоненты регулируются отдельно.
