# Folden

[English](README.md) | Русский

Folden — локальный настольный редактор Markdown и обычных текстовых файлов.

В основе проекта простой контракт:

* пользовательские данные остаются на машине пользователя;
* обычные файлы остаются источником истины;
* Markdown остаётся читаемым вне Folden;
* основные сценарии должны быть прямыми и предсказуемыми.

## Что умеет

Folden открывает файлы и папки, редактирует Markdown в Source- и Visual-режимах, навигирует по длинным документам через оглавление и карту, работает с вкладками и двухпанельным split view, безопасно сохраняет файлы, восстанавливает несохранённую работу, обнаруживает внешние изменения и сохраняет локальные настройки раскладки между запусками.

Folden не является облачным сервисом заметок, платформой совместного редактирования, мобильным приложением, базой знаний на скрытой БД, платформой плагинов или AI-продуктом для письма.

## Требования

* Node.js и npm.
* Rust toolchain с Cargo.
* Windows C++ Build Tools с workload `Desktop development with C++`.
* Microsoft Edge WebView2 Runtime.

## Быстрый старт

```powershell
npm install
npm run app:dev
```

Полезные команды:

```powershell
npm run vue:dev       # frontend только в браузере
npm run app:build     # desktop-сборка без установщиков
npm run app:run       # запуск последнего собранного desktop executable
npm run quality       # версии, типы, unused, cycles, lint и unit-тесты
npm run test:e2e      # Playwright smoke tests
```

Проверки Rust выполняются из `src-tauri/`:

```powershell
cargo fmt --check
cargo clippy -- -D warnings
cargo test
```

## Документация

* [docs/PRODUCT.ru.md](docs/PRODUCT.ru.md) — продуктовые принципы, текущая функциональность и границы.
* [docs/DEVELOPMENT.ru.md](docs/DEVELOPMENT.ru.md) — настройка, скрипты, проверки, CI, сборки и релизы.
* [docs/ARCHITECTURE.ru.md](docs/ARCHITECTURE.ru.md) — владение кодом, направление зависимостей и карта тестов.
* [docs/RELEASE.ru.md](docs/RELEASE.ru.md) — чек-лист релиза.
* [docs/DOGFOODING.ru.md](docs/DOGFOODING.ru.md) — шаблон dogfooding.
* [CHANGELOG.md](CHANGELOG.md) — история релизов.
