# Universal Agent Rules

This document is a reusable baseline for coding agents working on personal and small-team projects.

Project-specific instructions always override this file. If a repository has its own `AGENTS.md`, `CODEX.md`, README section, architecture notes, or local workflow docs, read them before changing code.

---

# Core Principle

Make the project simpler by the end of the task.

Prefer:

* working code over perfect architecture;
* clear code over clever code;
* direct logic over universal logic;
* explicit ownership over hidden wiring;
* one obvious behavior over three backup behaviors.

Do not make the system smarter on paper while making it harder to understand in practice.

---

# Decision Priority

When instructions conflict, use this order:

1. User safety and data safety.
2. Project-specific instructions.
3. Existing project behavior and conventions.
4. The smallest working change.
5. Simplicity and readability.
6. Performance, extensibility, and polish.

Never sacrifice data safety or existing behavior for cleaner architecture.

---

# Working Agreement

Before implementing:

1. Read the relevant existing code, configs, tests, documentation, and nearby files.
2. Understand the current behavior and the real task.
3. Choose the smallest change that solves the task.
4. Implement only after the current shape of the project is clear.

Ask the user when a decision changes:

* product behavior;
* architecture;
* data ownership;
* public APIs;
* migration strategy;
* user-facing text in a non-obvious way.

Do not ask when:

* the answer can be discovered from the repository;
* existing project patterns already provide the answer;
* a conservative local decision is sufficient.

---

# Stop Conditions

Stop and ask before continuing when:

* the task requires changing public behavior in a way not requested;
* the existing architecture contradicts the planned solution;
* multiple valid product decisions exist;
* data migration or destructive changes are involved;
* the implementation would require broad rewrites outside the task scope.

Do not ask when the issue is local, reversible, and clearly follows existing project patterns.

---

# Scope Control

Keep the change close to the task.

Do not do:

* drive-by refactors;
* broad formatting;
* dependency upgrades;
* folder reshuffles;
* unrelated cleanup.

If old code does not follow the current style, do not rewrite the whole file for beauty.

Write new and modified code in the current style and leave unrelated code alone.

---

# Feature First

The goal is to deliver working features.

Architecture, abstractions, optimization, and cleanup exist to support features, not replace them.

A partially completed feature with perfect architecture is still an incomplete feature.

---

# KISS

Simple code is a feature.

Avoid:

* architecture for future possibilities;
* abstractions without current users;
* generic layers for one concrete case;
* managers, providers, factories, adapters, helpers, and utils that only rename the problem;
* configuration systems that are more complex than the behavior they configure.

If the solution is hard to explain in a few minutes, it is probably too complex for the current task.

---

# YAGNI

Every new entity must have a concrete job today.

Do not implement:

* hypothetical modes;
* future extension points;
* compatibility paths;
* optional branches;

unless the task directly needs them.

Deleting future-proofing is often a valid simplification.

---

# DRY

Avoid meaningful duplication.

Do not create an abstraction just to remove two similar lines.

Duplication is cheaper than a bad abstraction until the shared behavior is real, stable, and named clearly.

When duplication appears, first ask what the shared concept actually is.

If there is no clear concept, keep the code direct.

---

# Delete Before Add

Before adding new code, check whether the problem can be solved by:

* removing code;
* simplifying code;
* reusing existing code.

The best code is often the code that no longer exists.

---

# Existing Patterns First

Before introducing a new pattern, structure, architecture, naming convention, or workflow:

1. Inspect how similar problems are already solved in the project.
2. Prefer existing project conventions.
3. Introduce a new pattern only when the current one is clearly insufficient.

Consistency is usually more valuable than theoretical elegance.

---

# No Architecture Tourism

Do not import patterns from other ecosystems without a concrete reason.

A project does not need repositories, services, mediators, presenters, event buses, ECS, dependency injection, factories, or state machines simply because another project used them.

Every architectural pattern must justify its existence inside the current project.

---

# One Source Of Truth

Each piece of state, configuration, text, and domain data should have one owner.

Do not duplicate stored state for convenience.

Do not store derived data when it can be calculated clearly from the source.

Do not keep:

* parallel progress models;
* config copies;
* cached UI truth;
* shadow state;

unless there is a measured reason and an invalidation rule.

---

# Explicit Ownership

Parameters belong to the domain that owns them.

Examples:

* account settings belong to the account owner;
* feature flags belong to the feature system;
* display state belongs near the presentation layer;
* persisted data belongs to storage ownership;
* user-facing text belongs to localization or content sources;
* generated artifacts belong to the tool that generates them.

If ownership is unclear, inspect existing patterns before inventing a new owner.

---

# Native Features First

Use the platform, framework, runtime, or standard library before creating a custom system.

Before adding custom infrastructure, check whether the existing toolchain already provides:

* localization;
* routing;
* validation;
* serialization;
* dependency injection;
* state updates;
* animation;
* input handling;
* asset processing;
* testing utilities.

Custom systems must simplify the project, not merely make it feel more engineered.

---

# Explicit Dependencies

If code depends on a specific structure, config, file, component, action, environment variable, or API shape, make that dependency visible.

Prefer direct references and clear errors over hidden discovery and silent recovery.

Do not add defensive fallback branches that hide:

* broken wiring;
* missing config;
* invalid state;
* stale data.

Fallbacks are useful only when the fallback is real product behavior.

---

# Code Shape

Functions should do one job.

Modules should have one responsibility.

Prefer pure functions when they naturally fit.

Keep side effects obvious and close to the operation that requires them.

Use early returns for simple control flow.

Avoid deeply nested conditionals.

Avoid comments that merely restate the code.

Comments should explain:

* intent;
* constraints;
* non-obvious decisions;
* important context.

---

# Naming

Use names that describe behavior or meaning.

Prefer short names that fit in memory:

* saveFile
* loadFile
* editorState
* currentFile
* selectedSlot
* profileData

Avoid architecture theater:

* AbstractWorkspaceDocumentManagerFactoryProvider
* UniversalRuntimeStateResolutionCoordinator
* ConfigurableEntityBehaviorProxyController

If a name needs more than two or three meaningful words, check whether the concept is too vague or doing too much.

---

# Architecture

Prefer a flat structure until the project earns more layers.

Organize code by domain and behavior, not by generic technical buckets.

Avoid folders named:

* helpers
* utils
* misc
* common
* shared

unless the repository already has a clear and narrow convention for them.

If a helper wants to exist, first look for the domain that should own the behavior.

---

# Components, Views And Presentation Code

Keep presentation layers focused.

Components should be small, but not shattered into fragments.

A component should solve one understandable task.

View components should usually receive prepared data and render it.

Runtime-to-view translation should live in orchestration code, presenters, adapters, parent components, or whatever pattern the project already uses.

Do not make display components responsible for discovering global state, parsing configs, or deciding business behavior unless that is already the established local pattern.

---

# State And State Containers

Stores should store state.

Do not put every calculation into a store just because a store exists.

Do not duplicate:

* server data;
* config data;
* local UI state;
* derived values;

into one mutable blob.

Keep state minimal, named, and owned.

---

# Configuration And Tuning

Values that designers, operators, maintainers, or future-you will tune should be visible in the expected place:

* config files;
* editor fields;
* admin panels;
* environment variables;
* documented constants;
* existing settings.

Do not hide tuning values inside implementation code when they are part of product behavior.

Group settings by meaning, not by type.

---

# Type Safety

Types should make the code easier to read and safer to change.

Avoid:

* any without a strong reason;
* vague object/unknown usage where a concrete type is obvious;
* complex generics that hide simple data structures;
* type gymnastics that only prove the author won a private argument with the compiler.

Prefer explicit domain types at module boundaries.

---

# Errors

Errors should be explicit and useful.

Do not use empty catch blocks.

Do not swallow errors unless silence is the intended product behavior and that intent is documented.

Developer mistakes should fail loudly during development.

User-facing failures should be handled gracefully without hiding diagnostic information from logs or tools.

---

# Dependencies

Every new dependency needs a clear reason.

Before adding a library, ask:

**Will this make the project simpler one year from now?**

Prefer:

* existing dependencies;
* built-in APIs;
* small local code.

Do not add a package for a tiny function unless correctness, maintenance, security, or domain complexity justifies it.

---

# External Documentation

When working with a library, framework, SDK, API, CLI, or cloud service, use current official documentation before answering or implementing.

Do not rely on memory when documentation is easily available.

Do not use documentation lookup for ordinary refactoring, business logic, code review, or project-local rules.

---

# User Interfaces

Preserve the existing design system unless the task is explicitly redesign work.

Do not add:

* local visual overrides;
* one-off fonts;
* custom interaction patterns;

without a clear reason.

Keep UI behavior predictable.

---

# Content And Localization

User-facing text should come from the project's content or localization system when one exists.

Do not hardcode user-facing text if localization already exists.

Preserve wording unless explicitly asked to rewrite it.

Keep content ownership clear and traceable.

---

# Files And Generated Artifacts

Do not manually edit:

* generated files;
* caches;
* build outputs;
* lock metadata;
* tool-owned artifacts;

unless the task explicitly requires it.

Before deleting files, prove they are unused, duplicated, corrupted, or obsolete.

Do not clean "mess" just because it looks messy.

Some software sediment is load-bearing.

---

# Git And User Changes

Assume the working tree may contain user changes.

Never revert, overwrite, or delete changes you did not make unless explicitly requested.

Before committing or staging, inspect what changed.

Keep commits scoped.

Do not:

* amend;
* force-push;
* reset;
* perform destructive git operations;

without explicit user approval.

---

# Verification

Run the smallest meaningful verification that matches the risk of the change.

Prefer checks that are close to real usage:

* unit tests;
* integration tests;
* build checks;
* runtime smoke tests;
* validation commands.

Do not overclaim partial checks.

If verification is limited, say so clearly.

---

# Agent Communication

Be brief, concrete, and honest.

Do not repeat explanations the user already accepted.

Mention assumptions only when they affect the result.

Report:

* what changed;
* how it was verified;
* what was intentionally not changed;
* remaining risks or follow-ups.

Do not drown the user in implementation details unless requested.

---

# Forbidden By Default

Avoid:

* overengineering;
* premature optimization;
* hidden magic;
* unused code;
* speculative abstractions;
* silent fallback behavior;
* duplicate sources of truth;
* broad rewrites during narrow tasks;
* custom systems over native features;
* dependency additions without justification;
* architecture that is harder to delete than the problem it solves.

---

# Good Solution Checklist

A good solution is:

* easy to read;
* easy to explain;
* easy to test;
* easy to change;
* easy to delete.

If the code can be removed later without collapsing the project, it was probably shaped well.
