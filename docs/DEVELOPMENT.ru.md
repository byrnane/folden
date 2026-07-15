# Разработка Folden

[English](DEVELOPMENT.md) | Русский

Этот документ описывает настройку окружения, команды, проверки, CI, артефакты сборки и процесс выпуска. Правила владения кодом и зависимостей описаны в [ARCHITECTURE.ru.md](ARCHITECTURE.ru.md), а чек-лист выпуска — в [RELEASE.ru.md](RELEASE.ru.md).

## Требования

Folden использует:

- Node.js и npm;
- Rust toolchain с Cargo;
- Windows C++ Build Tools с workload `Desktop development with C++`;
- Microsoft Edge WebView2 Runtime.

В Windows установите Rust через Rustup:

```powershell
winget install --id Rustlang.Rustup
```

Откройте новый терминал и проверьте окружение:

```powershell
node --version
npm --version
rustc --version
cargo --version
```

Если `cargo` установлен, но недоступен в текущей оболочке, Tauri wrapper Folden добавляет стандартный путь Rustup Cargo перед запуском desktop-команд.

## Настройка

Установите npm-зависимости:

```powershell
npm install
```

Для установки, близкой к CI, используйте:

```powershell
npm ci
```

## Команды frontend

Запуск Vite-приложения только в браузере:

```powershell
npm run vue:dev
```

Сборка frontend:

```powershell
npm run vue:build
```

Предпросмотр собранного frontend:

```powershell
npm run vue:preview
```

Браузерная версия frontend не предоставляет реальные нативные диалоги, доступ к файловой системе, события закрытия окна и поведение watcher рабочего пространства.

## Команды desktop-приложения

Запуск Tauri-приложения в режиме разработки:

```powershell
npm run app:dev
```

Сборка Tauri-приложения без установщиков:

```powershell
npm run app:build
```

Сборка установочных пакетов для проверки релиза:

```powershell
npm run tauri -- build
```

Запуск последнего собранного desktop executable:

```powershell
npm run app:run
```

Передача команды в Tauri CLI:

```powershell
npm run tauri -- <command>
```

## Команды проверки качества

Запуск основного quality gate:

```powershell
npm run quality
```

`quality` запускает:

- `npm run version:check`;
- `npm run format:check`;
- `npm run vue:typecheck`;
- `npm run vue:unused`;
- `npm run deps:cycles`;
- `npm run lint`;
- `npm run test:unit`.

Отдельные проверки frontend:

```powershell
npm run vue:typecheck
npm run vue:unused
npm run deps:cycles
npm run lint
npm run test:unit
npm run test:coverage
npm run test:e2e
```

Headed- и UI-режимы E2E для отладки browser smoke tests:

```powershell
npm run test:e2e:headed
npm run test:e2e:ui
```

Проверки Rust из `src-tauri/`:

```powershell
cargo fmt --check
cargo clippy -- -D warnings
cargo test
```

## Рабочий процесс

1. Прочитайте относящиеся к задаче инструкции проекта и соседние файлы.
2. Внесите минимальное изменение, решающее задачу.
3. Сохраняйте явными пользовательское поведение, владение файлами и нативные контракты.
4. Запустите минимальный осмысленный набор проверок для изменённой области.
5. Для релизных или рискованных UI/runtime-изменений запустите расширенный quality gate и ручной desktop smoke test.

Перед коммитом обычного изменения рекомендуется выполнить:

```powershell
npm run quality
npm run lint
npm run test:coverage
npm run vue:build
```

Для нативных или чувствительных к релизу изменений также выполните:

```powershell
npm run test:e2e
cd src-tauri
cargo fmt --check
cargo clippy -- -D warnings
cargo test
```

Performance-проверки остаются вне обычного CI и запускаются командой:

```powershell
npm run test:performance
```

`tests/performance/budgets.json` — источник истины для абсолютных бюджетов. Runner также отклоняет регрессии выше 15%, когда текущая машина совпадает с принятой baseline-машиной.

## Артефакты сборки

Результат сборки frontend находится в:

```text
dist/
```

Результат desktop-сборки находится в:

```text
build/desktop/
```

Текущий путь к Windows executable:

```text
build/desktop/release/app.exe
```

`scripts/tauri.mjs` устанавливает `CARGO_TARGET_DIR=build/desktop`, поэтому артефакты Rust не попадают в `src-tauri/target`. `vite.config.ts` игнорирует и `src-tauri/target`, и `build/desktop`, чтобы избежать конфликтов Windows watcher с заблокированными файлами Cargo.

Source- и Visual-редакторы загружаются отдельными chunks. Baseline после closeout 0.8.5: около 240 KB для стартового chunk, 530 KB для Visual и 609 KB для Source до gzip. Предупреждение Vite с порогом 500 KB ожидаемо остаётся для editor chunks, потому что CodeMirror и Tiptap загружаются только при открытии соответствующего редактора; не скрывайте его повышением глобального warning limit.

## Windows CI

`.github/workflows/windows.yml` запускается при push в `master` и `main`, а также для pull request. Сейчас workflow выполняет:

- checkout;
- настройку Node с npm cache;
- настройку Rust с `rustfmt` и `clippy`;
- Rust cache;
- `npm ci`;
- `npm run quality`;
- `cargo fmt --check`;
- `cargo clippy -- -D warnings`;
- `cargo test`.

Browser E2E и desktop build остаются в release gate и не запускаются при каждом push.

## Версии и процесс выпуска

Проверка согласованности отслеживаемых файлов версий:

```powershell
npm run version:check
```

Подготовка следующего patch-релиза:

```powershell
npm run version:bump -- patch
```

`version:bump` обновляет отслеживаемые файлы версий приложения и подготавливает верхнюю запись changelog. Используйте команду только для намеренного release commit. Изменения только в документации не должны повышать версию или добавлять пользовательскую запись релиза в changelog.

Перед release commit запустите полный набор проверок, соответствующий масштабу релиза, и вручную проверьте desktop-приложение из собранного executable, если менялось пользовательское поведение. Перед публикацией используйте [RELEASE.ru.md](RELEASE.ru.md) и проверяйте установочный пакет, а не только результат `npm run app:build`.
