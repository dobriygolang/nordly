---
name: nordly-ui
description: Implement or refine Nordly desktop, web companion, or extension UI, including layouts, interaction states, responsive behavior, and accessibility. Use for frontend work in apps; do not apply a new visual system to backend-only tasks or small UI fixes.
---

# Nordly UI

Read the repository `AGENTS.md`, then the affected app's `AGENTS.md` and
required engineering documents. Work from that app directory. Use its actual
package scripts and dependencies rather than assuming a framework or test tool.

## Reuse the app's visual language

- Inspect the target screen and nearby components, styles, tokens, icons, and
  layout primitives. Reuse the established patterns before adding a component
  or dependency. For a narrow fix, preserve the surrounding design.
- For a new screen, establish the main user action, information hierarchy, and
  navigation. Match typography, spacing, color, and density to the existing app.
- Keep desktop, guest web, and extension behavior distinct. Read the app's
  authentication, API mapping, sync, and settings rules before wiring data.

## Implement the interaction

- Cover the states actually possible in this flow: loading, empty, success,
  failure, disabled, or offline as applicable. Expose failures using the app's
  existing error handling. Do not substitute invented data for failed reads.
- Use semantic elements, labels, keyboard navigation, and visible focus. Check
  overflow and resizing in the viewports relevant to this app.
- Keep state ownership and side effects in the app's established layers. Reuse
  existing API clients and typed contracts rather than adding parallel parsers.
- For redesign requests, make the visual change intentional and scoped. Avoid
  unrelated global restyling, placeholder controls, or decorative features that
  do not help the requested interaction.

## Verify the result

Run the relevant available typecheck, lint, build, and behavior checks according
to the app instructions. When a runnable UI and browser or native app tooling
are available, inspect the changed screen and exercise the primary interaction
and its relevant failure state. Distinguish visual inspection from automated
checks; report when runtime or visual verification was unavailable.
