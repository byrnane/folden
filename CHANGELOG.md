# Changelog

## Формат записей

* Патчи: 3-5 коротких строк.
* Минорные версии: 5-10 строк.
* Мажорные версии: полноценные release notes.

## 0.8.2 - 2026-07-10

* Outline и document map вынесены в общие UI-компоненты для Source и Visual.
* Outline подсвечивает текущий раздел и поддерживает клавиатурную навигацию.
* Settings вынесены из AppShell без смены владельца настроек и layout actions.
* Добавлены проверки карты документа и активного раздела; документация описывает 0.8-навигацию и workspace ignores.

## 0.8.1 - 2026-07-09

* Outline и document map получили отдельные toggle-кнопки рядом с Visual/Source.
* Outline больше не даёт горизонтальный scroll на длинных заголовках.
* Document map показывает структурный preview Markdown и явный viewport текущей области прокрутки.
* Дефолтное desktop-окно стало крупнее, а shell ужимает sidebar и topbar на узкой ширине.
* Добавлены regression checks для toggle-кнопок, viewport marker и plain text состояния.

## 0.8.0 - 2026-07-09

* Вкладки и Open Editors теперь показывают короткие уникальные labels для одноимённых документов.
* Workspace tree поддерживает workspace-level ignore через `.folden/workspace.json`, action `Hide from workspace` и muted folders без поддерживаемых файлов.
* Compact activity/sidebar mode принудительно держит workspace actions icon-only, сохраняя tooltip и accessible names.
* Markdown editor получил outline sidebar и document map в Visual и Source режимах с persisted шириной.
* Native workspace contract расширен `hasOpenableDescendants` и workspace settings командами; добавлены unit/Rust test cases и обновлены E2E mocks.

## 0.7.2 - 2026-07-07

* Расширено unit-покрытие критических контроллеров, path helpers и drag/drop payload.
* Visual table-команды теперь отключены вне таблицы и корректно применяют toolbar-изменения, даже когда фокус находится на кнопке.
* Drop в right split включает split-pane для файлов из workspace и внешних путей.
* E2E closeout расширен проверками Visual/Source save/reopen, raw HTML/frontmatter Source preservation, Source dialog cancel/validation, scroll/selection и table/task-list flows.
* Подтверждён release gate: `npm run quality`, `npm run test:e2e`, `npm run app:build`.

## 0.7.1 - 2026-07-07

* Scratch Markdown-документы теперь получают Visual mode и общий Markdown toolbar по имени `Untitled.md`, даже до первого сохранения.
* Source link/image команды переведены на тот же dialog и validation flow, что Visual; фиктивные URL больше не вставляются без подтверждения.
* Toolbar расширен table UX: Visual поддерживает вставку таблицы и row/column/delete actions через Tiptap, Source вставляет Markdown table snippet.
* Добавлены regression tests для scratch toolbar, mode-switch без dirty, Source dialogs, Visual table/task-list edit round-trip и raw HTML/frontmatter safety gate.
* Raw HTML/frontmatter остаются safety-gated для Visual в 0.7; Source сохраняет эти блоки без переписывания.

## 0.7.0 - 2026-07-07

* Visual и Source режимы Markdown получили общий контракт editor commands и один DocumentToolbar для применимых Markdown-документов.
* Source-редактор поддерживает команды форматирования через CodeMirror transactions: emphasis, заголовки, списки, цитаты, code block, ссылки, изображения и divider.
* Переключение Visual/Source сохраняет scroll, selection и focus через view sessions и больше не помечает документ dirty из-за технической нормализации строк.
* Visual Markdown расширен поддержкой таблиц и task lists на Tiptap extensions, а Markdown safety gate больше не блокирует эти GFM-конструкции.
* Source-режим получил тёмную тему Folden с подсветкой Markdown/GFM-синтаксиса и стабильной раскладкой.
* Drag and drop расширен для вкладок, open editors, файлов из workspace tree и внешних путей с preview, drop zones, insertion marker и right split target.
* Добавлены regression tests для command parity, GFM round-trip, Markdown safety, pane state и drag/drop payload/drop behavior.

## 0.6.9 - 2026-07-03

* Меню заголовков в DocumentToolbar переведено на обычный disclosure/dropdown без неполной ARIA menu-семантики; Escape закрывает список и возвращает фокус на trigger.
* Legacy `activityWidth` мигрирует только при загрузке persisted layout в infrastructure, а application settings нормализует только актуальную модель.
* UI-пороги переключения Activity Rail вынесены из application settings, а EditorPaneGrid полностью очищает pending timeout и pointer drag при размонтировании.

## 0.6.8 - 2026-07-03

* Pointer drag вкладок защищён от сбоя `setPointerCapture`, если браузер уже потерял активный pointer.
* `suppressNextTabClick` теперь сбрасывается автоматически, если после успешного переноса вкладка размонтировалась и click не пришёл.
* Повторно подтверждены `quality`, E2E и desktop build для финального 0.6 closeout.

## 0.6.7 - 2026-07-03

* Исправлен pointer drag вкладок: отменённый перенос больше не глушит следующий клик, а drag завершается через pointer capture.
* UI-компоненты отвязаны от storage-модуля settings; типы, лимиты, defaults и нормализация перенесены в application layer.
* `EditorPaneGrid` получает готовую модель pane/tab и больше не вытаскивает документы повторно во время рендера.
* Меню заголовков и fit-label поведение теперь управляются внутри UI-компонентов без глобального DOM-обхода из Shell.
* E2E-проверки разнесены по тематическим spec-файлам, хрупкие проверки иконок и декоративного CSS заменены на пользовательские контракты.

## 0.6.6 - 2026-07-03

* `AppShell.vue` разгружен: Open Editors, Visual toolbar и editor pane grid вынесены в отдельные компоненты.
* Лимиты размеров, задержек и UI-иконок вынесены в именованные константы вместо разбросанных чисел.
* Обновлены unit и e2e проверки для layout/settings bounds.

## 0.6.5 - 2026-07-02

* Activity rail получил изменяемую ширину 44-132px с сохранением в layout settings.
* Labels в rail и sidebar actions теперь автоматически скрываются, когда не помещаются по ширине.
* `New scratch` получил отдельную иконку черновика, отличную от создания обычного файла.
* У переключателя Visual/Source убрано underline-состояние, активность остаётся через фон и цвет.

## 0.6.4 - 2026-07-02

* `Load remote images` перенесён к переключателю Visual/Source, а `New scratch` сгруппирован с созданием файлов и папок.
* Меню заголовков теперь закрывается кликом вне себя и по Escape через общий механизм для disclosure-меню.
* H1, H2 и Subtitle добавлены прямыми кнопками на Visual toolbar рядом с меню остальных заголовков.

## 0.6.3 - 2026-07-02

* Перестроен sidebar workspace: путь перенесён в заголовок workspace, а создание файлов и папок — к дереву файлов.
* Обновлена Visual toolbar: команды сгруппированы по смыслу, добавлено меню уровней заголовков и понятные expanded labels.
* Исправлены направление иконки переноса вкладки и иконка focus mode; compact режим теперь оставляет только иконки у toolbar/chrome-кнопок.

## 0.6.2 - 2026-07-02

* Исправлены UX-регрессии редактора: tab drag-and-drop, переходы по якорным ссылкам и клики по внешним ссылкам в Visual.
* Settings вынесен в отдельное view без панели текущего файла, действий редактора и status bar.
* Обновлены compact/comfortable состояния toolbar-кнопок, подсветка активной панели и Open Editors.
* Autosave получил задержку в секундах и дополнительные режимы сохранения при потере фокуса и смене файла.

## 0.6.0 - 2026-07-01

* Перестроен application shell: добавлены activity bar, Open Editors, общий document toolbar, компактный status bar и toast для diagnostics.
* Вкладки стали рабочим инструментом: поддержаны drag-and-drop reorder, перенос между панелями, закрытие средней кнопкой и автоматическое создание/закрытие split.
* Добавлены persisted layout settings: ширина sidebar, split ratio, focus mode и reset layout отдельно от состояния документов.
* Добавлен раздел Settings с базовыми editor/files/appearance настройками, применяемыми без перезапуска.
* Обновлена визуальная система: единые UI tokens, focus-ring, компактные controls, unified scrollbars, активные pane/tab states и скрытая close-кнопка вкладки.
* Diagnostics и logs убраны из основного toolbar; diagnostics export доступен из Settings и показывает toast-сообщение.
* Расширены unit и E2E проверки для новых settings/layout, tab DnD/reorder, shared toolbar и обновлённого workspace UX.

## 0.4.15 - 2026-07-01

* Native DTO и ошибки закреплены в доменном TS-контракте, а Tauri-вызовы собраны в application ports для документов, workspace, session, diagnostics и native events.
* `applicationShell`, lifecycle, document workflow и workspace workflow переведены на сгруппированные native ports без изменения UI, autosave, recovery, watcher и conflict flow.
* Rust native layer разнесён из монолитного `lib.rs` по модулям `types`, `errors`, `state`, `paths`, `watcher`, `documents`, `workspace`, `persistence` и `diagnostics` с прежними command names.
* Добавлены TS/Rust contract tests на стабильный shape native DTO/errors и общий fixture без пользовательских путей.
* Quality gate расширен ESLint flat config, coverage baseline, dependency-cycle/unused checks и Windows CI шагами для lint, coverage, E2E, Vue build, Rust fmt/clippy/test и app build.

## 0.4.14 - 2026-07-01

* Удалены неиспользуемые импорты и значения, оставшиеся после декомпозиции `applicationShell`.
* Добавлена строгая проверка `npm run vue:unused` для unused locals/parameters поверх `vue-tsc`.
* Добавлен локальный `npm run deps:cycles` без новых зависимостей и общий `npm run quality` для быстрого технического gate.

## 0.4.13 - 2026-07-01

* Закрытие окна теперь блокируется, если Folden не смог финализировать session/recovery persistence.
* Владение Tauri watcher subscriptions закреплено за `applicationLifecycleController`; `externalChangesController` оставлен для debounce и маршрутизации filesystem events.
* Добавлены unit-тесты для async cleanup race и основных сценариев `workspaceWorkflowController`.

## 0.4.12 - 2026-06-30

* Завершена декомпозиция `applicationShell`: lifecycle, workspace workflow и document workflow оформлены отдельными контроллерами.
* Закреплены контракты между shell и контроллерами без изменения пользовательского поведения редактора.

## 0.4.11 - 2026-06-30

* `applicationShell` доведен до тонкого composition root: логика панелей, workspace, session/recovery и внешних изменений перенесена в контроллеры.
* Состояние контроллеров закрыто от прямых внешних мутаций, UI и shell меняют его через методы контроллеров.
* Добавлены изолированные unit-тесты для `paneController`, `workspaceController`, `sessionController` и `externalChangesController`.

## 0.4.10 - 2026-06-30

* `applicationShell` разделен на контроллеры документов, панелей, workspace, session, watcher-изменений, диалогов и команд.
* Файлы `src` разложены по слоям `application`, `domain`, `infrastructure`, `ui` и `assets`, а публичный `useApplicationShell` оставлен совместимым фасадом.
* Unit-тесты вынесены из `src` в `tests/unit`, конфиги Vitest/TypeScript обновлены под новую структуру.

## 0.4.9 - 2026-06-30

* Исправлено закрытие окна после подтверждения сохранения: `Save all` больше не оставляет приложение открытым.
* Сохранение открытого Visual-документа больше не вызывает лишний reload view и видимое мерцание.
* Добавлен локальный экспорт diagnostics без содержимого документов, recovery/session state и полных пользовательских путей.
* Добавлен 0.4 measurement checklist и усилена проверка синхронизации версий, включая `Cargo.lock`.

## 0.4.8 - 2026-06-30

* Исправлено обновление дерева workspace после сохранения вложенных файлов: элементы из раскрытых папок больше не пропадают из сайдбара.
* Расширены browser-level E2E-проверки для сценариев 0.4: lazy tree, split Source/Visual, settings, recovery, autosave, conflicts и remote images.
* `npm run test:e2e` на Windows теперь завершается стабильно без зависания после успешного прогона.

## 0.4.7 - 2026-06-30

* Усилены проверки Markdown round-trip: поддерживаемые конструкции теперь сверяются по семантической структуре, а не только по почти побайтному совпадению текста.
* Для unsafe Markdown добавлены явные regression-фикстуры, чтобы frontmatter, таблицы, task list, footnotes, raw HTML и директивы по-прежнему останавливались safety gate до Visual rewrite.
* В `test_files/markdown_kitchen_sink.md` добавлен большой ручной smoke-файл для mixed Markdown, а диалоги в интерфейсе теперь корректно прокручиваются и не обрезаются на небольших окнах.

## 0.4.6 - 2026-06-30

* В Visual-режиме удалённые картинки больше не загружаются сами: вместо этого Folden показывает placeholder и отдельное действие `Load remote images` для текущего документа.
* Локальные изображения рядом с Markdown-файлом теперь корректно открываются в preview внутри workspace через Tauri asset protocol.
* Ошибки загрузки картинок стали явными и не ломают редактор: Markdown остаётся без изменений, а preview показывает понятный статус.
* Добавлены unit-, Playwright- и native-проверки для remote image flow и локального image preview.

## 0.4.5 - 2026-06-30

* Внешние конфликты файлов теперь открываются в отдельном диалоге с читаемым построчным сравнением версии Folden и версии с диска.
* В конфликте доступны действия `Keep Folden version`, `Reload disk version`, `Save As` и применение ручного merged-результата без потери единственной dirty-копии.
* Разрешение конфликта теперь создает явную новую ревизию документа, а reload с диска сохраняет локальные несохраненные правки в отдельной conflict-copy.
* Добавлены unit- и Playwright-проверки для line-diff, conflict-revision и сценария с сохранением локальной копии при reload.

## 0.4.4 - 2026-06-30

* Настройки workspace теперь стабильно сохраняют встроенные ignore-имена и применяют их к дереву файлов.
* Autosave доведён для уже сохранённых файлов: scratch-документы не автосохраняются, а unsafe Visual-состояния и внешние проблемы по-прежнему останавливают запись.
* Ошибки сохранения в исходный файл теперь переводят документ в понятные состояния `conflict` и `missing`.
* Добавлены проверки для workspace ignore и browser-level сценарий autosave в мокнутом Tauri-окружении.

## 0.4.3 - 2026-06-29

* Добавлен npm-скрипт для обновления версии приложения

## 0.4.2 - 2026-06-29

* Основные кнопки и глобальные горячие клавиши переведены на единый command registry.
* Отключённые команды больше не выполняются через шорткаты, а редакторские сочетания Visual не перехватываются приложением.
* Исправлен ложный dirty-state при закрытии неизменённого Markdown в Visual после технической нормализации строк.
* `npm run app:run` больше не отцепляет `app.exe` от консоли и завершается вместе с приложением.

## 0.4.1 - 2026-06-29

* `App.vue` сокращён до layout shell: оркестрация приложения вынесена в `applicationShell`.
* Поведение открытия, split-view, сохранения, recovery, watcher и диалогов сохранено без пользовательских изменений.

## 0.4.0 - 2026-06-29

* Добавлен план архитектурного релиза 0.4 как активный рабочий артефакт.
* Глобальные горячие клавиши переведены на command registry с проверкой доступности команд.
* Добавлен foundation настроек приложения с безопасными значениями по умолчанию.
* Добавлен выключенный по умолчанию Autosave для уже сохранённых файлов через существующую save queue.
* Расширены unit-тесты для команд и настроек.

## 0.3.2 - 2026-06-29

* Добавлен первый browser-level E2E слой на Playwright с мокнутым Tauri API.
* CI теперь запускает unit-тесты, Chromium E2E, frontend build и существующие Rust/Tauri проверки.
* Исправлен recursive update при регистрации editor adapter в Vue.
* Browser-only режим больше не запускает desktop session persistence.
* Npm-скрипты сгруппированы по зонам `vue:*`, `app:*`, `test:*`.

## 0.3.1 - 2026-06-29

* Исправлено первичное открытие Markdown-файлов в Visual: текст больше не появляется только после переключения вкладки или режима.
* Исправлено повторное проявление этого бага после переключения workspace туда и обратно.
* Исправлено состояние открытых документов после rename файла или папки: путь и повторное открытие больше не расходятся.
* Исправлен dev-watch: Vite больше не пытается наблюдать Cargo-артефакты внутри `build`.
* Добавлены регрессионные проверки для Visual Markdown sync и rename открытых документов.

## 0.3.0 - 2026-06-28

* Добавлен доменный каркас редактора, общий revision-based dirty state и shared undo/redo для одного документа в нескольких представлениях.
* Сохранение переведено на атомарную запись с проверкой stale fingerprint и сохранением BOM/line ending.
* Добавлены встроенные диалоги приложения вместо browser prompt/confirm и защита от потери несохранённых изменений при закрытии вкладок и окна.
* Реализованы session restore и recovery snapshots для сохранённых и scratch-документов после аварийного завершения.
* Добавлен filesystem watcher с reload/conflict/missing-target сценариями и ленивое обновление workspace-веток.
* Дерево workspace переведено на ленивую загрузку директорий; добавлен baseline-файл измерений для 0.3.
* Visual Markdown mode теперь проверяет unsafe-конструкции, блокирует remote images по умолчанию, валидирует ссылки и работает под production CSP.
* Добавлены bounded local logs, panic/frontend error logging, команда открытия папки логов и Windows CI c release gate для 0.3.

## 0.2.3 - 2026-06-28

* Исправлено предложенное имя при сохранении нового файла: заголовки из цифр больше не превращаются в `Untitled.md`.
* В футере снова показывается полный путь к файлу без Windows-префикса `\\?\`.
* Добавлена кнопка сброса форматирования выделенного текста в визуальном Markdown-редакторе.
* Убрана лишняя логика относительного пути в статусбаре.

## 0.2.2 - 2026-06-28

* При скрытии split-view правые вкладки переносятся в левую панель.
* Убран лишний Open Right в правой панели.
* Горячие клавиши переведены на физические клавиши и работают в любой раскладке.
* В футере скрыт Windows-префикс `\\?\` у путей.
* View/source теперь хранится отдельно для каждой панели.

## 0.2.1 - 2026-06-28

* Исправлен компактный футер и отображение пути текущего файла.
* Добавлены базовые горячие клавиши для сохранения, открытия, новых вкладок и split-view.
* Новый файл при сохранении получает предложенное имя из H1 или первых слов текста.
* Исправлено повторное открытие сохранённого нового файла в отдельной вкладке.
* Клик по пустому месту в сайдбаре снимает выделение с файла или папки.

## 0.2.0 - 2026-06-28

* Добавлен визуальный Markdown-редактор на Tiptap 3.
* CodeMirror оставлен как source-режим для Markdown и обычных текстовых файлов.
* Добавлены workspace-папка, дерево файлов и файловые операции.
* Добавлены вкладки для нескольких открытых файлов и split-view на две панели.
* Добавлена базовая панель форматирования Markdown.
* Обновлён тёмный интерфейс с сайдбаром и центрированным текстовым полотном.
* Удаление файлов и папок идёт через системную корзину.

## 0.1.0 - 2026-06-24

* Создан первый Tauri 2 + Vue 3 + TypeScript + Vite каркас приложения.
* Подключён CodeMirror 6 как source-редактор.
* Добавлены создание, открытие и сохранение текстового файла.
* Добавлен dirty state для несохранённых изменений.
* Добавлено отображение имени и пути текущего файла.
* Добавлена минимальная тёмная тема.
* Добавлены базовые документы по MVP, настройке окружения и выбору редакторного движка.
* Исправлены Windows-проблемы с Cargo PATH, Vite watcher и desktop build path.
