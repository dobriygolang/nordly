---
name: nordly-system-design
description: Design Nordly service boundaries, APIs, data ownership, sync and event flows, or evaluate architecture tradeoffs. Use for system-design questions and architecture proposals; do not turn routine bug fixes into architecture reviews.
---

# Nordly system design

Start with the repository `AGENTS.md` and its document-loading instructions. Read
local `AGENTS.md` files only for components involved in the requested design.
For cross-service behavior, consult `docs/onboarding/README.md`; verify the
relevant path in code before describing it as implemented.

## Ground the decision

- State the requested outcome and constraints. Distinguish observed behavior,
  user requirements, and assumptions. Ask only when a missing requirement could
  change the decision; otherwise proceed with a stated assumption.
- Identify the current owner of data and business decisions. Trace one concrete
  request or event end to end, including authentication and persistence boundaries.
- Use measured or supplied scale figures. If capacity is unknown, show the
  assumption behind an estimate rather than inventing traffic or SLOs.

## Select a design

Prefer extending an existing boundary when it satisfies the request. Compare
alternatives only where there is a meaningful tradeoff. Account for:

- API/event contracts, producers, consumers, and the authoritative data owner;
- consistency, ordering, duplicate delivery, retries, and transaction boundaries;
- failure visibility, recovery, and optional integration behavior under the
  project's fail-fast rules;
- authorization across trust boundaries, especially guest access and sync;
- rollout and data migration appropriate to whether behavior is already shipped;
- observability and a concrete way to prove the design meets the requirement.

Keep proposed state separate from current implementation. Cite the relevant
files for current behavior. Explain the selected tradeoff, affected components,
and the smallest implementable slice with acceptance criteria. Use a diagram
when it clarifies ownership or message flow. Do not create services, edit code,
or persist an architecture document unless the task requests that work.
