---
name: nordly-backend
description: Implement or fix Nordly Go backend services, gRPC/HTTP endpoints, PostgreSQL/Redis persistence, and workers. Use for backend code changes; use nordly-system-design for architecture proposals without implementation.
---

# Nordly backend

Locate the repository root, read its `AGENTS.md`, then work from the affected
`services/<name>/` directory. Read that service's `AGENTS.md` and the engineering documents required by
the root and service instructions. AGENTS.md and those standards remain canonical;
this skill defines the implementation workflow rather than another style guide.

## Establish the change boundary

- Trace the affected operation through proto, transport, service/usecase, and
  persistence or adapter. Read the existing implementation and nearby tests
  before choosing the responsible layer.
- For an API change, identify actual callers with targeted search before changing
  its contract. Open another component only when that dependency makes it relevant.
- Use the service's current migration, transaction, outbox, and test patterns.
  Check the Makefile and module version instead of guessing tools or commands.

## Implement and prove behavior

- Change the narrowest layer that owns the behavior. Use the root architecture
  and fail-fast rules to resolve design choices; avoid opportunistic extraction.
- For writes, establish the atomic boundary and determine what happens if an
  external side effect fails after persistence. For retried handlers or workers,
  inspect the existing idempotency and acknowledgement behavior.
- Add regression coverage for changed behavior, including the relevant failure
  path. Generate mocks through the existing service tooling when ports change.
- Generate API code through the service target when proto changes. Run focused
  package tests first, then the applicable service checks from its instructions.
  Preserve exit status and inspect full diagnostics if RTK hides needed detail.
- Apply the root registry and documentation rules when their triggers match.

Report the resulting behavior, checks actually run, and unresolved constraints.
Do not claim success for checks that could not run.
