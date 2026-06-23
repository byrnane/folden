# Universal Agent Rules

This document is a reusable baseline for coding agents working on personal and small-team projects.

Project-specific instructions always override this file. If a repository has its own `AGENTS.md`, `CODEX.md`, README section, architecture notes, or local workflow docs, read them before changing code.

## Core Principle

Make the project simpler by the end of the task.

Prefer:

- working code over perfect architecture;
- clear code over clever code;
- direct logic over universal logic;
- explicit ownership over hidden wiring;
- one obvious behavior over three backup behaviors.

Do not make the system smarter on paper while making it harder to understand in practice.

## Working Agreement

Before implementing:

1. Read the relevant existing code, configs, tests, documentation, and nearby files.
2. Understand the current behavior and the real task.
3. Choose the smallest change that solves the task.
4. Implement only after the current shape of the project is clear.

Ask the user when a decision changes product behavior, architecture, data ownership, public APIs, migration strategy, or user-facing text in a non-obvious way.

Do not ask when the answer can be discovered from the repository or when a conservative local decision is enough.

## Scope Control

Keep the change close to the task.

Do not do drive-by refactors, broad formatting, dependency upgrades, folder reshuffles, or cleanup outside the affected area unless they are required to finish safely.

If old code does not follow the current style, do not rewrite the whole file for beauty. Write new and changed code in the current style and leave unrelated code alone.

## KISS

Simple code is a feature.

Avoid:

- architecture for future possibilities;
- abstractions without current users;
- generic layers for one concrete case;
- managers, providers, factories, adapters, helpers, and utils that only rename the problem;
- configuration systems that are more complex than the behavior they configure.

If the solution is hard to explain in a few minutes, it is probably too complex for the current task.

## YAGNI

Every new entity must have a concrete job today.

Do not implement hypothetical modes, future extension points, compatibility paths, or optional branches unless the task directly needs them.

Deleting future-proofing is often a valid simplification.

## DRY

Avoid meaningful duplication.

Do not create an abstraction just to remove two similar lines. Duplication is cheaper than a bad abstraction until the shared behavior is real, stable, and named clearly.

When duplication appears, first ask what the shared concept actually is. If there is no clear concept, keep the code direct.

## One Source Of Truth

Each piece of state, configuration, text, and domain data should have one owner.

Do not duplicate stored state for convenience.

Do not store derived data when it can be calculated clearly from the source.

Do not keep parallel progress models, config copies, cached UI truth, or shadow state unless there is a measured reason and an invalidation rule.

## Explicit Ownership

Parameters belong to the domain that owns them.

Examples:

- account settings belong to the account/profile owner;
- feature flags belong to the feature-flag system;
- display state belongs near the presentation layer;
- persisted data belongs to the storage/session owner;
- user-facing text belongs to the content or localization source;
- generated artifacts belong to the tool that generates them.

If ownership is unclear, inspect existing patterns before inventing a new owner.

## Native Features First

Use the platform, framework, runtime, or standard library before creating a custom system.

Before adding custom infrastructure, check whether the existing toolchain already provides:

- localization;
- routing;
- validation;
- serialization;
- dependency injection;
- state updates;
- animation;
- input handling;
- asset or data processing;
- testing utilities.

Custom systems must simplify the project, not merely make it feel more engineered.

## Explicit Dependencies

If code depends on a specific structure, config, file, component, action, environment variable, or API shape, make that dependency visible.

Prefer direct references and clear errors over hidden discovery and silent recovery.

Do not add defensive fallback branches that hide broken wiring, missing config, invalid state, or stale data.

Fallbacks are useful only when the fallback is a real product behavior, not when it masks a developer mistake.

## Code Shape

Functions should do one job.

Modules should have one responsibility.

Prefer pure functions when they naturally fit.

Keep side effects obvious and close to the operation that requires them.

Use early returns for simple control flow.

Avoid deeply nested conditionals.

Avoid comments that restate the code. Add comments only when intent, constraints, or non-obvious context would otherwise be easy to miss.

## Naming

Use names that describe behavior or meaning.

Prefer short names that fit in memory:

- `saveFile`
- `loadFile`
- `editorState`
- `currentFile`
- `selectedSlot`
- `profileData`

Avoid names that describe architecture theater:

- `AbstractWorkspaceDocumentManagerFactoryProvider`
- `UniversalRuntimeStateResolutionCoordinator`
- `ConfigurableEntityBehaviorProxyController`

If a local name needs more than two or three meaningful words, check whether the concept is too vague or doing too much.

## Architecture

Prefer a flat structure until the project earns more layers.

Organize code by domain and behavior, not by generic technical buckets.

Avoid folders named `helpers`, `utils`, `misc`, `common`, or `shared` unless the repository already has a clear and narrow convention for them.

If a helper wants to exist, first look for the domain that should own the behavior.

## Components, Views, And Presentation Code

When the project has components, views, templates, screens, or another presentation layer, keep that layer focused.

Components should be small, but not shattered into fragments.

A component should solve one understandable task.

View components should usually receive prepared data and render it.

Runtime-to-view translation should live in orchestration code, adapters, presenters, or parent components, depending on the project style.

Do not make display components responsible for discovering global state, parsing configs, or deciding business behavior unless that is already the established local pattern.

## State And State Containers

When the project uses stores, contexts, services, reducers, atoms, models, or other state containers, keep them narrow.

Stores should store state.

Do not put every calculation into a store just because a store exists.

Do not duplicate server data, config data, local UI state, and derived values into one mutable blob.

Keep state minimal, named, and owned.

## Configuration And Tuning

Values that designers, operators, maintainers, or future-you will tune should be visible in the expected place:

- config files;
- admin panels or editor fields;
- environment settings;
- documented constants;
- existing project settings.

Do not hide tuning values inside implementation code when they are part of product behavior.

Group settings by meaning, not by type.

Do not create a separate category for every single property. Organization should reduce scanning effort, not inflate it.

## Type Safety

Types should make the code easier to read and safer to change.

Avoid:

- `any` without a strong reason;
- vague `object`/`unknown` usage where a concrete type is clear;
- complex generics that hide the simple shape of the data;
- type gymnastics that only prove the author won a private argument with the compiler.

Prefer explicit domain types at module boundaries.

## Errors

Errors should be explicit and useful.

Do not use empty `catch` blocks.

Do not swallow errors unless silence is the intended product behavior and that intent is documented.

Error messages should explain what failed and include enough context to act on it.

Developer mistakes should fail loudly during development.

User-facing failures should be handled gracefully without hiding diagnostic information from logs or tools.

## Dependencies

Every new dependency needs a clear reason.

Before adding a library, ask:

Will this make the project simpler one year from now?

Prefer existing dependencies, built-in APIs, and small local code when they solve the problem clearly.

Do not add a package for a tiny function unless correctness, maintenance, security, or domain complexity justifies it.

## External Documentation

When working with a library, framework, SDK, API, CLI, or cloud service, use current official documentation or the configured documentation tool before answering or implementing.

If Context7 is available, use it for library and framework documentation:

1. Resolve the library ID from the library name and the full user question.
2. Pick the best matching `/org/project`.
3. Query docs with the selected ID and the full question.
4. Answer or implement from the fetched documentation.

Do not use documentation lookup for ordinary refactoring, business logic, code review, or project-local rules.

## User Interfaces

When the project has a user interface, preserve the existing design system unless the task is explicitly redesign work.

Do not add local visual overrides, one-off fonts, or custom interaction patterns without a clear reason.

Keep UI components predictable:

- buttons perform actions;
- prompts explain actions;
- modals handle modal interaction;
- toasts report short feedback;
- forms own input;
- views render prepared state.

User-facing text should come from the project content, copy, or localization pipeline when one exists.

## Content And Localization

When the project has user-facing text, documentation snippets, prompts, templates, translations, or other content sources, keep them owned and traceable.

Do not hardcode user-facing text if the project has localization files or a content pipeline.

When adding visible text:

- add or update the localization/content source;
- keep keys named consistently;
- preserve existing source wording unless asked to rewrite it;
- update all required languages when the project expects parallel text.

When one content domain grows, prefer a clear separate source file over bloating an unrelated one.

## Files And Generated Artifacts

Do not manually edit generated files, import caches, build outputs, lock metadata, or tool-owned artifacts unless the task explicitly requires it and the workflow is understood.

Before deleting files, prove they are unused, duplicated, corrupted, or obsolete.

Do not clean "mess" just because it looks messy. Software has sediment. Some of it is load-bearing, because of course it is.

## Git And User Changes

Assume the working tree may contain user changes.

Never revert, overwrite, or delete changes you did not make unless the user explicitly asks for it.

Before committing or staging, inspect what changed.

Keep commits scoped and named according to the repository convention.

Do not amend, force-push, reset, or run destructive git operations without explicit user approval.

## Verification

Run the smallest meaningful verification that matches the risk of the change.

Prefer checks that are close to real usage:

- unit tests for isolated logic;
- integration tests for cross-module behavior;
- build checks for type or bundling changes;
- runtime smoke tests for user-facing flows, routing, automation, or data processing;
- validation commands for generated artifacts and tool-owned files.

Do not overclaim partial checks. If a check is blocked, flaky, environment-specific, or only covers syntax, say so clearly.

When a narrow check gives a misleading signal because it lacks project context, use a broader whole-project validation path.

## Agent Communication

Be brief, concrete, and honest.

Do not repeat the same explanation after the user has already acknowledged it.

Mention assumptions when they affect the result.

Report what changed, how it was checked, and any real remaining risk.

Do not bury the user in implementation inventory when a short outcome summary is enough.

## Forbidden By Default

Avoid:

- overengineering;
- premature optimization;
- hidden magic;
- unused code;
- speculative abstractions;
- silent fallback behavior;
- duplicate sources of truth;
- broad rewrites during narrow tasks;
- custom systems over native features;
- dependency additions without justification;
- architecture that is harder to delete than the problem it solves.

## Good Solution Checklist

A good solution is:

- easy to read;
- easy to explain;
- easy to test;
- easy to change;
- easy to delete.

If the code can be removed later without collapsing the project, it was probably shaped well.
