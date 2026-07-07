# Folden 0.7 — P0 Tasks

## Closeout status — 2026-07-07

0.7.0 закрыл базовый общий toolbar, Source commands, Markdown safety baseline, GFM tables/task lists, Source theme и drag/drop. 0.7.1 closeout закрывает оставшиеся P0-регрессии:

- Scratch Markdown-документы считаются Markdown по `path ?? name`, поэтому `Untitled.md` получает Visual mode и toolbar до сохранения.
- Source link/image используют dialog + validation flow, как Visual; hardcoded placeholder insertion убран.
- Table UX добавлен в общий toolbar: Visual выполняет insert/row/column/delete actions через Tiptap, Source поддерживает только insert Markdown table snippet.
- Visual/Source view state проходит через явный adapter-конвертер selection state между Source offsets и Visual positions.
- Raw HTML, HTML comments, frontmatter, footnotes и custom directives остаются protected/safety-gated для Visual в 0.7; Source должен сохранять их без переписывания.
- Regression coverage: scratch toolbar, kitchen sink safety gate, supported Markdown 10x mode switch без dirty, Source dialogs, Visual table/task-list edit round-trip, selection conversion.

## 0.7-P0-01 — Бесшовное переключение Visual / Source

**Описание:** Переключение между Visual и Source не должно менять документ само по себе.

**Результат:** Если пользователь не редактировал документ, после любого количества переключений содержимое остаётся тем же, dirty-состояние не появляется, сохранение не требуется.

**Статус:** закрыто в 0.7.0/0.7.1 regression coverage.

## 0.7-P0-02 — Сохранение позиции при переключении режимов

**Описание:** При переходе между Visual и Source пользователь должен оставаться в том же рабочем месте документа.

**Результат:** После переключения режима сохраняется ожидаемая область документа, курсор или выделение не сбрасываются в начало без причины.

**Статус:** закрыто через view sessions и adapter-конвертер selection state; точный semantic mapping между Markdown offsets и ProseMirror positions остаётся best-effort.

## 0.7-P0-03 — Общий toolbar для Visual и Source

**Описание:** Панель форматирования должна быть доступна не только в Visual, но и в Source.

**Результат:** В Source-режиме пользователь видит тот же основной набор инструментов форматирования и вставки, что и в Visual-режиме.

**Статус:** закрыто; scratch `.md` documents включены в 0.7.1.

## 0.7-P0-04 — Команды форматирования в Source-режиме

**Описание:** Команды toolbar в Source-режиме должны редактировать Markdown-исходник.

**Результат:** Bold, Italic, Strike, Inline Code, Headings, Lists, Quote, Code Block, Link, Image и Divider работают в Source-режиме и дают ожидаемый Markdown-текст.

**Статус:** закрыто; link/image используют dialog + validation.

## 0.7-P0-05 — Единый контракт editor commands

**Описание:** Команды редактора должны быть общими для режимов, без привязки только к Visual-редактору.

**Результат:** UI запускает одну и ту же команду независимо от режима, а активный редактор выполняет её корректно для своего представления документа.

**Статус:** закрыто; table commands добавлены в общий контракт, Source структурно поддерживает только `insert-table`.

## 0.7-P0-06 — Markdown compatibility baseline

**Описание:** Folden должен безопасно открывать и сохранять обычные Markdown-файлы без потери содержимого.

**Результат:** Поддержан базовый набор CommonMark + GFM: headings, paragraphs, emphasis, links, images, lists, nested lists, blockquotes, inline code, fenced code blocks, horizontal rules, tables, task lists, raw HTML, HTML comments и frontmatter.

**Статус:** закрыто для supported Markdown + Source preservation; raw HTML/comments/frontmatter не редактируются в Visual без safety acknowledgment.

## 0.7-P0-07 — Безопасный round-trip для Markdown

**Описание:** Открытие, просмотр, переключение режимов и сохранение не должны незаметно переписывать Markdown.

**Результат:** Документ после round-trip остаётся эквивалентным исходнику; неподдержанные Visual-фичи не теряются и не ломаются.

**Статус:** закрыто regression tests; unsupported Visual features protected by safety gate.

## 0.7-P0-08 — Таблицы

**Описание:** Таблицы Markdown должны перестать быть проблемным кейсом для открытия и работы с документом.

**Результат:** Markdown-файлы с таблицами открываются без ошибок, таблицы сохраняются без потери структуры, Visual-режим не портит исходник.

**Статус:** закрыто для Visual table editing + Source insert snippet; Source row/column structural editing outside 0.7.

## 0.7-P0-09 — HTML, comments и frontmatter

**Описание:** Raw HTML, HTML comments и frontmatter должны безопасно проходить через редактор.

**Результат:** Документы с HTML, комментариями и frontmatter можно открыть, просмотреть, переключить режим и сохранить без удаления или переписывания этих блоков.

**Статус:** закрыто как Source-preserved + Visual safety gate. Полный Visual preserve для raw blocks не входит в 0.7.

## 0.7-P0-10 — Task lists

**Описание:** Markdown task lists должны поддерживаться как часть базовой GFM-совместимости.

**Результат:** Списки `- [ ]` и `- [x]` открываются и сохраняются корректно, без превращения в обычные списки и без потери состояния чекбоксов.

**Статус:** закрыто, включая Visual checkbox edit regression.

## 0.7-P0-11 — Нормальная тема Source-режима

**Описание:** Source-режим должен визуально соответствовать Folden, а не выглядеть как дефолтный старый code editor.

**Результат:** У Source-режима есть цельная тёмная тема: читаемый текст, спокойная подсветка Markdown-синтаксиса, нормальные ссылки, gutter, active line, selection и cursor.

**Статус:** закрыто в 0.7.0.

## 0.7-P0-12 — Drag preview

**Описание:** При drag&drop пользователь должен видеть, что именно он тащит.

**Результат:** При перетаскивании вкладки, open editor item или файла отображается понятный ghost/preview с названием объекта.

**Статус:** закрыто в 0.7.0.

## 0.7-P0-13 — Drop zones

**Описание:** Во время drag&drop должны быть видны доступные зоны сброса.

**Результат:** Tab bar, editor body, существующие panes и right split zone подсвечиваются только когда в них можно бросить текущий объект.

**Статус:** закрыто в 0.7.0.

## 0.7-P0-14 — Drag&drop вкладок

**Описание:** Перетаскивание вкладок должно быть визуально понятным и предсказуемым.

**Результат:** Вкладки можно переупорядочивать, переносить между panes и открывать в новом right split через drop-zone; место вставки видно до drop.

**Статус:** закрыто в 0.7.0.

## 0.7-P0-15 — Drag&drop файлов из workspace tree

**Описание:** Файлы из дерева проекта должны перетаскиваться в рабочую область редактора.

**Результат:** Файл из workspace tree можно бросить в текущий editor body, tab bar или right split zone; файл открывается в ожидаемом месте.

**Статус:** закрыто в 0.7.0.

## 0.7-P0-16 — External drag&drop

**Описание:** Перетаскивание файлов и папок снаружи приложения должно быть частью нормального рабочего процесса.

**Результат:** Внешний Markdown/text-файл открывается в выбранном pane, внешняя папка открывается как workspace, неподдержанный объект даёт понятную реакцию.

**Статус:** закрыто в 0.7.0.

## 0.7-P0-17 — Regression tests для 0.7

**Описание:** Ключевые сценарии 0.7 должны быть закреплены тестами.

**Результат:** Проверены mode switch без dirty, Markdown round-trip, Source toolbar commands, таблицы/HTML/task lists, tab drag&drop, file drag&drop и external drag&drop.

**Статус:** закрыто с 0.7.1 closeout regression coverage.

## 0.7-P0-18 — Release quality gate

**Описание:** Релиз 0.7 не должен проходить без базовой проверки качества.

**Результат:** Перед релизом проходят typecheck, lint, unit tests, e2e smoke tests и desktop build.

**Статус:** pending до финального запуска `npm run quality`, `npm run test:e2e`, `npm run app:build`.
