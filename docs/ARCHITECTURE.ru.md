# Архитектура Folden

[English](ARCHITECTURE.md) | Русский

Этот документ описывает текущую кодовую базу и является основным справочником при изменении структуры приложения.

## Направление зависимостей

```text
UI
  ↓
applicationShell / публичный facade
  ↓
controllers и workflows
  ↓
application ports
  ↓
Tauri infrastructure adapters
  ↓
нативные модули Rust
  ↓
файловая система и операционная система
```

Зависимости должны продолжать идти сверху вниз. Верхние слои могут зависеть от контрактов нижних слоёв и чистых доменных правил. Нижние слои не должны импортировать UI или application orchestration для выполнения своей работы.

## Слои frontend

### `src/ui`

Здесь находятся Vue views, редакторы, диалоги и UI рабочего пространства. UI-компоненты отображают состояние и вызывают публичный application facade. В них не должно быть доменных правил, wiring нативных команд, очередей сохранения или политики файловой системы.

### `src/application`

Здесь находится orchestration приложения:

* `applicationShell.ts` объединяет controllers, infrastructure adapters, lifecycle hooks и facade, возвращаемый UI;
* `controllers/` владеет состоянием приложения, workflows, диалогами, командами, persistence сессии, внешними изменениями и lifecycle;
* `settings/` владеет типами, значениями по умолчанию, ограничениями и нормализацией настроек приложения и раскладки;
* `ports/nativePorts.ts` определяет application-side контракты нативных возможностей;
* helpers и shell types хранят application-specific форматирование и типы facade рядом с shell.

Application workflows могут использовать доменные правила и application ports. Они не должны напрямую импортировать Tauri API.

### `src/domain`

Здесь находятся независимые от фреймворка правила и типы:

* helpers ревизий документов и dirty-state;
* состояние документов, история, синхронизация editor sessions и очередь сохранения;
* безопасность Markdown, разрешение изображений и diff конфликтов;
* guards нативных DTO и форма нативных ошибок;
* правила фильтрации рабочего пространства.

`domain` не должен зависеть от Vue, Tauri, UI-компонентов, browser storage или infrastructure adapters.

### `src/infrastructure`

Infrastructure реализует application contracts:

* `infrastructure/tauri/nativePorts.ts` группирует реализации native ports на основе Tauri;
* `infrastructure/tauri/files.ts` содержит низкоуровневые helpers вызова Tauri-команд;
* `infrastructure/settings/settings.ts` сохраняет browser-side настройки приложения и раскладки и выполняет миграцию устаревшего layout.

Infrastructure может зависеть от application port types и domain DTO. Он не должен владеть продуктовыми workflows.

## Разрешённые зависимости

* `domain` — чистая TypeScript-логика без зависимостей от Vue, Tauri, UI и infrastructure;
* `application` использует доменные правила и application port contracts;
* application workflows не импортируют Tauri API напрямую;
* `infrastructure` реализует application ports;
* `ui` вызывает application facade, возвращаемый `useApplicationShell`;
* UI-компоненты раскладки, например `ActivityRail.vue`, `OpenEditors.vue`, `DocumentToolbar.vue` и `EditorPaneGrid.vue`, владеют отображением и непосредственными деталями взаимодействия, но не application workflows;
* `applicationShell` является composition root: он связывает зависимости и предоставляет state/actions, но не должен становиться местом для новой доменной логики или крупных workflows.

## Владение состоянием

Controllers владеют состоянием. Внешний код получает refs, computed values и явные методы вместо прямого изменения внутренних данных другого controller.

Ответственность state controllers:

* `documentController` владеет открытыми документами, ревизиями, dirty-state, внешними состояниями, состоянием сохранения и обновлениями содержимого;
* `paneController` владеет панелями, активной панелью, split-state, размещением документов по панелям, editor sessions и режимами документов для каждой панели;
* `workspaceController` владеет открытым рабочим пространством, состоянием раскрытия/загрузки/ошибок дерева, выбором, недавними рабочими пространствами и remapping путей;
* `sessionController` владеет ожидающими recovery entries, сборкой snapshots сессии и восстановления, debounced persistence и очисткой своего persistence timer;
* `externalChangesController` владеет предупреждениями watcher, debounced refresh рабочего пространства, debounced reload документов и маршрутизацией нативных filesystem events;
* `visualSafetyController` владеет решениями безопасности Visual-режима и разрешениями удалённых изображений для отдельных документов;
* `dialogController` владеет состоянием prompt-, confirm-, unsaved-, Markdown safety-, conflict- и recovery-диалогов;
* `commandController` и `applicationCommandController` владеют регистрацией и выполнением команд;
* настройки приложения и раскладки нормализуются в `src/application/settings`, а browser persistence остаётся в `src/infrastructure/settings/settings.ts`.

Ответственность workflow controllers:

* `documentWorkflowController` координирует открытие, сохранение, сохранение копии, закрытие, autosave, reload, обработку конфликтов, flush редакторов панелей и undo/redo;
* `workspaceWorkflowController` координирует открытие и восстановление рабочего пространства, загрузку дерева, создание файлов/папок, rename, trash, открытие в split и refresh веток после файловых изменений;
* `applicationLifecycleController` владеет mount/dispose, восстановлением при запуске, recovery prompt, подписками на нативные события, закрытием окна, финальным сохранением session/recovery и очисткой listeners.

Lifecycle-код должен находиться в `applicationLifecycleController`. Controllers, создающие timers или listeners, должны предоставлять `dispose`.

## Native Ports

Application-код взаимодействует с нативными возможностями через `src/application/ports/nativePorts.ts`.

Группы ports:

* `DocumentFilePort`: открытие текстовых файлов, открытие файлов рабочего пространства по пути, сохранение текста и закрытие нативных handles документов;
* `WorkspaceFilePort`: открытие или восстановление каталогов рабочего пространства, listing каталогов, открытие файлов, создание файлов/каталогов, rename путей и перемещение в корзину;
* `SessionStoragePort`: загрузка/сохранение состояния сессии и recovery snapshots;
* `DiagnosticsPort`: логирование frontend events, открытие папки логов и экспорт диагностики;
* `NativeEventPort`: подписка на нативные события и доступ к операциям close/destroy текущего нативного окна.

При добавлении новой возможности Tauri сначала добавьте application port contract, затем реализуйте его в infrastructure. Application controllers должны получать port через dependency injection, а не импортировать Tauri API.

## Нативный слой Rust

Код Rust находится в `src-tauri/src`.

Ответственность модулей:

* `native/types.rs`: стабильные сериализуемые DTO, общие с TypeScript contracts;
* `native/errors.rs`: коды нативных ошибок, retryability, пользовательские сообщения и техническая диагностика;
* `native/state.rs`: авторизованное состояние нативных документов и рабочих пространств;
* `native/paths.rs`: нормализация и проверка путей, защита корня и безопасные helpers путей рабочего пространства;
* `native/watcher.rs`: настройка filesystem watcher, фильтрация событий и подавление временных сохранений Folden;
* `native/documents.rs`: открытие/сохранение текстовых файлов, определение формата, атомарная запись, защита stale fingerprint и lifecycle нативных документов;
* `native/workspace.rs`: авторизация рабочего пространства, listing каталогов, открытие/создание/rename/trash файлов рабочего пространства;
* `native/persistence.rs`: хранение session и recovery snapshots;
* `native/diagnostics.rs`: логирование frontend events, открытие папки логов и экспорт диагностики с редактированием чувствительных данных.

`lib.rs` регистрирует Tauri-команды, настраивает нативное состояние и логирование, устанавливает panic hook и собирает нативный слой. Новые нативные модули должны подключаться через `lib.rs`, но модуль не должен становиться местом для специфической логики отдельных подсистем.

## Основные потоки данных

### Открытие документа

1. UI вызывает application facade.
2. `documentWorkflowController` запрашивает содержимое файла через `DocumentFilePort`.
3. Infrastructure вызывает Tauri-команду.
4. Rust проверяет доступ, читает и декодирует файл, возвращает содержимое, формат, путь и fingerprint.
5. `documentController` создаёт или обновляет состояние документа.
6. `paneController` прикрепляет документ к активной панели и создаёт view session.
7. Планируется persistence сессии.

### Редактирование документа

1. Source- или Visual-редактор сообщает об обновлении содержимого.
2. `documentWorkflowController` выполняет flush или маршрутизирует обновление.
3. `documentController` принимает обновление, увеличивает ревизию и записывает историю.
4. `paneController` синхронизирует видимые sessions одного документа.
5. При необходимости планируются autosave и persistence сессии.

### Сохранение и autosave

1. Сохранение начинается через `documentWorkflowController`.
2. Выполняется flush текущего редактора панели.
3. Документ переходит в состояние queued/saving.
4. `DocumentFilePort.saveTextFile` получает содержимое, ожидаемый fingerprint, формат файла и необязательное предлагаемое имя.
5. Rust отклоняет устаревший fingerprint, выполняет атомарную запись, сохраняет формат и возвращает обновлённые fingerprint/path.
6. `documentController` помечает ревизию сохранённой либо устанавливает состояние conflict/error.
7. Если сохранённый путь затрагивает дерево, планируется refresh рабочего пространства.

### Переключение Source и Visual

1. UI просит facade установить режим документа в панели.
2. `applicationShell` запрещает Visual-режим для путей, не относящихся к Markdown.
3. `visualSafetyController` анализирует безопасность Markdown и при необходимости показывает prompt.
4. Перед сменой режима выполняется flush содержимого текущего редактора.
5. `paneController` записывает выбранный режим для пары панель/документ.

### Обновление настроек и раскладки

1. Settings UI изменяет `appSettings` или `layoutSettings`, предоставленные application facade.
2. Типы, limits, defaults и normalization настроек находятся в `src/application/settings`.
3. Browser persistence выполняется в `src/infrastructure/settings/settings.ts`.
4. Устаревшие persisted layout values мигрируют в infrastructure во время загрузки.
5. Состояние документов остаётся отделённым от настроек и persistence сессии.

### Открытие и обновление рабочего пространства

1. `workspaceWorkflowController` запрашивает рабочее пространство через `WorkspaceFilePort`.
2. Rust авторизует root и возвращает descriptor.
3. Workspace controller сохраняет root и состояние дерева.
4. Содержимое каталогов загружается лениво через `listDirectory`.
5. Файловые операции обновляют или remap состояние рабочего пространства и планируют точечный refresh веток.

### Событие filesystem watcher

1. Rust отправляет нативное событие файловой системы для авторизованного рабочего пространства.
2. `applicationLifecycleController` владеет подпиской и передаёт событие дальше.
3. `externalChangesController` маршрутизирует событие.
4. Открытые документы помечаются отсутствующими, конфликтными или ставятся в очередь на reload.
5. Ветки рабочего пространства обновляются без принудительной полной перезагрузки дерева, когда это возможно.

### Внешний конфликт

1. Сохранение или watcher event обнаруживает, что файл изменился вне Folden.
2. `documentController` устанавливает conflict-state документа.
3. Пользователь может загрузить версию с диска, оставить версию Folden, сохранить копию или применить объединённый результат.
4. `documentWorkflowController` выполняет выбранное действие через состояние документа и native ports.

### Persistence сессии

1. `applicationShell` наблюдает за рабочим пространством, панелями, режимами, метаданными документов и recovery entries.
2. `sessionController` выполняет debounce persistence.
3. `SessionStoragePort` записывает состояние сессии и recovery snapshots через Rust persistence.
4. Сохранённые документы хранят metadata пути/fingerprint. Черновые и dirty-документы могут создавать recovery entries.

### Восстановление после сбоя

1. При запуске `applicationLifecycleController` загружает состояние сессии и recovery snapshots.
2. Валидные layout и документы восстанавливаются, когда это возможно.
3. Ожидающие recovery entries показываются в recovery dialog.
4. Пользователь выбирает записи для восстановления или удаления.
5. Восстановленное содержимое становится открытыми документами, после чего recovery-state обновляется.

### Закрытие приложения

1. `applicationLifecycleController` обрабатывает запрос нативного окна на закрытие.
2. Dirty-документы запускают явную обработку несохранённых изменений.
3. Приложение ожидает финальную запись session и recovery.
4. Нативные handles документов закрываются.
5. Timers и listeners очищаются.
6. Нативное окно уничтожается только после завершения финализации.

## Добавление функции

1. Определите, является ли функция доменным правилом, application workflow, UI-поведением, infrastructure adapter или нативной операцией.
2. Добавьте или расширьте чистые domain types/rules, если поведение не зависит от Vue и Tauri.
3. Расширьте существующий controller, если владелец состояния уже понятен. Создавайте новый workflow только для отдельной ответственности.
4. Добавляйте application port только тогда, когда функции нужна нативная возможность или возможность окружения.
5. Реализуйте Tauri adapter в `src/infrastructure/tauri`.
6. Добавьте или расширьте Rust command/module только тогда, когда операция должна перейти в нативный слой.
7. Свяжите зависимости в `applicationShell`.
8. Предоставьте `src/ui` минимально необходимый facade API.
9. Добавьте тесты на том уровне, где находится поведение.

Пример функции только для frontend:

1. Добавьте domain helper, если существует чистое правило.
2. Добавьте state/methods controller для поведения.
3. Предоставьте метод через `useApplicationShell`.
4. Обновите соответствующий Vue-компонент.
5. Добавьте domain/controller tests и E2E-проверку, если workflow видим пользователю.

Пример функции, которой нужен доступ к файловой системе или нативному слою:

1. Определите или расширьте application port.
2. Добавьте вызов Tauri в infrastructure.
3. Добавьте Rust command и module logic.
4. Обновите TypeScript/Rust contract tests, если изменились DTO.
5. Внедрите port в workflow controller.
6. Добавьте Rust tests и application workflow tests.

## Правила, которые нельзя нарушать

* Не добавляйте доменную логику в Vue-компоненты.
* Не добавляйте крупные workflows в `applicationShell`.
* Не импортируйте Tauri API напрямую из application controllers.
* Не изменяйте состояние другого controller вне его методов.
* Не обходите очередь сохранения или координацию persistence сессии.
* Не дублируйте нативные DTO без contract tests.
* Не храните содержимое сохранённого пользовательского документа как каноническую копию в скрытых данных приложения.
* Не меняйте контракты нативных команд без обновления TypeScript/Rust contract tests.

## Карта тестирования

| Тип изменения | Обязательные тесты |
| --- | --- |
| Чистое правило документа/workspace/Markdown | Domain unit tests |
| Владение состоянием controller | Controller unit tests |
| Workflow orchestration | Workflow/controller unit tests с fakes |
| Форма native port adapter | Application-port или infrastructure tests, если доступны |
| Native DTO или command contract | TypeScript/Rust contract tests |
| Поведение Rust для paths/filesystem/persistence | Rust module tests |
| Пользовательский editing/workspace flow | Playwright E2E smoke и целевые unit tests |
| Close, save, recovery или watcher behavior | Unit tests, Rust tests при изменении нативного поведения и ручной desktop smoke |

Текущие Playwright E2E specs находятся в `tests/e2e`:

* `panes-tabs.spec.ts`: split panes, reorder/transfer вкладок, Open Editors и malformed drag payloads;
* `recovery-conflict.spec.ts`: recovery, внешние изменения, отсутствующие файлы и конфликты;
* `settings-autosave.spec.ts`: persistence настроек, экспорт диагностики и поведение autosave;
* `shell-layout.spec.ts`: activity rail, toolbar, persistence layout, fit labels и reset layout;
* `visual-safety.spec.ts`: безопасность Visual-режима и поведение локальных/удалённых изображений;
* `workspace-save.spec.ts`: открытие/создание/rename/trash в workspace и refresh после сохранения.

## Lifecycle и очистка

* Controllers, владеющие timers, debounced work или listeners, должны предоставлять `dispose`.
* У каждой подписки должен быть один явный владелец.
* Асинхронная регистрация listener должна корректно переживать ранний dispose.
* Финальная persistence session и recovery должна завершаться до уничтожения нативного окна.
* Нативные handles документов должны закрываться при финализации приложения или удалении документов.
