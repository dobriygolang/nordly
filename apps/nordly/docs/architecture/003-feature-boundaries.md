# ADR 003: Renderer feature boundaries

Status: Accepted

## Context

The renderer combines local persistence, remote transport, synchronization, and UI composition. Direct imports across those concerns make offline and cloud behavior difficult to test independently.

## Decision

`shared` contains cross-feature models and infrastructure and does not import `app`, `pages`, or `widgets`. Features do not import those composition layers. Within a feature:

- `repository` owns IndexedDB access.
- `remote` owns HTTP transport.
- `sync` coordinates repository and remote operations.
- `api` is the public local-first façade.

Pages and widgets compose public feature APIs and do not import feature `repository`, `remote`, or `sync` internals. The existing vault settings notes-sync import remains the documented exception. Task and planning code consume calendar only through `features/calendar/api`.

Aliases (`@shared`, `@features`, `@pages`, `@widgets`, `@app`, and `@platform`) express these boundaries. Architecture tests enforce the reliable public-import rules; ESLint and TypeScript enforce the remaining static constraints.

## Consequences

Transport and persistence can change behind a feature API without changing page composition. Cross-feature behavior must be promoted to a public API instead of reaching into implementation folders.
