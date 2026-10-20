# ADR 007 — Wiki targets

## Status

Accepted.

## Context

`[[board:Title]]` was parsed in four places, and the published-note page did not know about it. Markdown links in the editor were styled but not clickable. Image embeds `![[file]]` were not images.

## Decision

`apps/shared/markdown/wikiTarget.ts` (`@nordly-markdown`) is the only parser. Registered keys are `board` and `link`. Any other text, including a colon in a title, is a note title.

- `link` accepts only `https` URLs with no username or password. Anything else is `invalid` and does not open.
- An alias after `|` is the visible label. A link tooltip shows the real host.
- `![[file]]` is an embed. `|300` on an embed or on `![alt|300](file)` is a width in pixels, from 1 to 2000.
- An embed is resolved next to the note first, then by file name across the vault. Several matches use the shortest path.
- Note links sent to the server are only `kind: 'note'`. Board links, web links, and embeds are not note links.
- The published page uses the same parser. `link` becomes an https anchor. `board` is plain text. An embed that is not an https image stays as text.

## Consequences

New keys are one registry entry plus a click handler. The desktop editor and the published page cannot drift on what a link means.
