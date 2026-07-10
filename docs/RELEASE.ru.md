# Чек-лист релиза Folden

[English](RELEASE.md) | Русский

Используйте этот список перед созданием тега или публикацией релиза Folden. Сохраняйте подтверждения выполнения в release notes, pull request или локальном журнале релиза.

## Синхронизация версии

* Выполнить `npm run version:check`.
* Подтвердить одинаковую версию в `package.json`, `package-lock.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock` и верхней записи `CHANGELOG.md`.
* Проверить, что документация не описывает удалённые или переименованные модули.

## Автоматические проверки

Выполнить из корня репозитория, если для команды не указано другое:

```powershell
npm run quality
npm run test:coverage
npm run test:e2e
npm run vue:build
```

Выполнить из `src-tauri/`:

```powershell
cargo fmt --check
cargo clippy -- -D warnings
cargo test
```

## Closeout-проверки Markdown

Для релизов редактора подтвердить, что автоматическое E2E-покрытие включает:

* переключение Visual/Source без dirty-state, если пользователь не менял содержимое;
* правку в Visual с мгновенным переходом в Source;
* большой kitchen-sink Markdown через Visual, Source, save, close и reopen;
* сохранение raw HTML, HTML comments и frontmatter в Source без переписывания;
* Visual safety gates для Markdown-конструкций, которые Tiptap не может сохранить как raw source;
* редактирование ячеек таблицы, row/column commands, удаление таблицы и сохранение task-list checkbox state;
* Source link/image dialogs: insert, edit, cancel и validation;
* toolbar для scratch `Untitled.md` до сохранения;
* drag/drop вкладок, файлов из workspace и external paths в editor panes и right split.
* workspace-level ignores после reopen не закрывают уже открытые файлы;
* Outline следует текущему разделу Markdown в Source и Visual; клавиатурная навигация и click/drag карты остаются рабочими.

Не описывайте Visual mode как поддержку любого Markdown. Контракт 0.7: редактирование supported CommonMark/GFM плюс safety-gated raw blocks; Source остаётся режимом сохранения raw Markdown.

## Desktop-сборка

Собрать установочный пакет, а не только executable с `--no-bundle`:

```powershell
npm run tauri -- build
```

Для smoke-сборки без установщика по-прежнему доступна команда `npm run app:build`, соответствующая `tauri build --no-bundle`.

Для Windows проверить, какие bundle targets были созданы из `src-tauri/tauri.conf.json`. Текущая конфигурация содержит `bundle.active: true` и `bundle.targets: "all"`.

## Ручной smoke test Windows installer

Использовать собранный артефакт установщика Windows:

* Установить приложение в чистом окружении Windows.
* Запустить Folden впервые после установки.
* Проверить запуск без установленных Node.js, Rust и dev dependencies.
* Проверить наличие WebView2 и корректное отображение UI.
* Проверить ожидаемое создание ярлыков и записей Start Menu.
* Открыть реальный Markdown-проект.
* Открыть, отредактировать, сохранить, закрыть и повторно открыть Markdown-файл.
* Открыть один документ в split view одновременно в Source- и Visual-режимах.
* Переключиться между Visual и Source.
* Проверить клавиатурную навигацию Outline и click/drag карты на длинном Markdown-документе.
* Скрыть файл или папку рабочего пространства, перезапустить Folden и убедиться, что уже открытый документ не закрылся.
* Включить autosave и убедиться, что сохранённый файл обновляется.
* Принудительно закрыть приложение и проверить recovery.
* Изменить открытый файл вне Folden и проверить reload/conflict flow.
* Создать, переименовать, переместить и отправить в корзину файлы и папки рабочего пространства.
* Проверить отображение локальных изображений и блокировку удалённых изображений до явного разрешения.
* Проверить сохранение layout и settings после перезапуска.
* Удалить Folden.
* Проверить отсутствие неожиданных файлов приложения после удаления.
* Повторно установить Folden.
* Установить новую версию поверх предыдущей.
* Проверить сохранение пользовательских настроек и recovery data после обновления там, где это ожидается.

## Артефакты

* Записать имя файла, версию и размер установщика.
* Записать размер установленного приложения.
* Проверить понятные имена release artifacts с указанием версии.
* Проверить наличие верхней записи релиза в `CHANGELOG.md`.
* Зафиксировать состояние подписи бинарников. Если подписи нет, отметить, что тестовая сборка не подписана.
* Проверить, что diagnostics и release artifacts не содержат содержимое документов, recovery/session state, полные приватные пути, секреты или другие пользовательские данные.
