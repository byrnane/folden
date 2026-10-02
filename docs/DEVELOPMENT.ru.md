# Разработка

[English](DEVELOPMENT.md) · [Архитектура](ARCHITECTURE.ru.md) · [Релиз](RELEASE.ru.md)

Инструкция предназначена для владельца проекта. Публичный доступ к исходникам не разрешает их изменение и распространение; условия находятся в [LICENSE.md](../LICENSE.md).

Зафиксированы **Node 24.16.0** (.nvmrc) и **Rust 1.96.0** (rust-toolchain.toml). Установите [prerequisites Tauri](https://v2.tauri.app/start/prerequisites/): C++ Build Tools и WebView2 для Windows, Xcode Command Line Tools для macOS либо WebKitGTK 4.1 и библиотеки разработки для Ubuntu 22.04. Пакеты macOS требуют систему 14+.

```text
npm ci
npm run app:dev
```

Разработка использует com.folden.editor.dev с отдельными settings/session/recovery. app:run запускает release-профиль. Замена установленного приложения и очистка профилей требуют разрешения и проверенного backup.

| Команда                  | Назначение                                                    |
| ------------------------ | ------------------------------------------------------------- |
| npm run vue:dev          | Browser UI без native filesystem/dialogs                      |
| npm run vue:build        | Frontend build                                                |
| npm run app:dev          | Native dev-приложение                                         |
| npm run app:build        | Executable без установщика                                    |
| npm run app:run          | Последний локальный release executable                        |
| npm run quality          | Версия, формат, типы, unused code, cycles, lint, unit         |
| npm run test:coverage    | Покрытие unit-тестами                                         |
| npm run test:e2e         | Chromium functional/UI; visual baselines Windows              |
| npm run test:performance | Отдельный измеряемый performance gate                         |
| npm run test:release     | Регрессии release scripts                                     |
| npm run privacy:check    | Приватные данные в source и исторические identities           |
| npm run licenses:check   | Детерминированный inventory установленных locked dependencies |

Native checks из src-tauri: cargo fmt --check, cargo clippy --locked --all-targets -- -D warnings, cargo test --locked. CI проверяет native code на четырёх release targets; browser E2E запускается на Windows. Приёмка реальных OS-сценариев проводится отдельно.

Frontend output — dist/, Cargo — build/desktop/, incremental compilation отключена. Release targets создают build/desktop/<target>/release/. После проверки финального пакета публикуемые файлы готовятся в build/release/<target>/. Для исторических checkout используйте отдельный target-dir, чтобы bundler не получил старый executable.

После изменения зависимостей загрузите четыре Cargo targets из RELEASE.ru.md, установите npm lock, выполните npm run licenses:generate, проверьте notices/provenance и npm run licenses:check. Inventory разделяет native runtime/build и содержит консервативный npm production graph; для архивов без лицензий явно указаны upstream и canonical texts. Дополнительные OS-библиотеки AppImage проверяются в финальном payload.

Кеши, диагностика, личные документы и .codex исключаются из публичного экспорта. Privacy checks показывают только имена файлов и причины. Для synthetic paths допускаются только точные file/literal allowlists, без исключения всех тестов. Оригинальный Git не меняется при подготовке отдельной очищенной истории.

Source/Visual editor chunks загружаются по требованию; предупреждение Vite о размере editor chunks ожидаемо. Сохраняйте document bytes, unsupported Markdown, локализацию и content ownership. [Dogfooding](DOGFOODING.ru.md) фиксирует реальные рабочие сессии отдельно от автоматических тестов.
