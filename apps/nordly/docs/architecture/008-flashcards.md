# ADR 008 — Flashcards

## Status

Accepted.

## Context

Cards for spaced repetition should live in notes, not in a separate editor. Progress must survive renaming a note or moving the file. The app has no card sync, and people who do not study should not see the feature.

## Decision

1. A line `front :: back` is one card. `front ::: back` is that card plus the reverse. Fenced blocks and inline code do not count. A list marker or checkbox at the start of the line is ignored. An empty side is an error on the review screen, not a card.
2. The card key is a hash of the normalized front (trim, lowercase, collapsed spaces) and the direction. It does not include the note id. The same question in two notes is one card, and the review screen says so. Editing the question creates a new card; the old progress stays as an orphan until it no longer matches any note.
3. IndexedDB `card_reviews` (database v7) stores only the schedule: due date, SM-2 ease, interval, reps, lapses, and the front text. Daily new-card counts live in `meta` at `${userId}::cards_daily::{YYYY-MM-DD}`. Nothing is uploaded.
4. Settings → General → Flashcards is off by default. `NordlySettings.flashcards` is `{ enabled, dailyNewLimit }` with a default of 20 new cards a day. Due reviews are not capped. The review page, the palette row, the `R` hotkey, and the note-header button stay hidden while the setting is off.
5. Review is a page (`cards`), not a Dock item. `1`–`4` grade Again, Hard, Good, and Easy.

## Consequences

Deleting a card from a note does not delete its review row. The review screen lists those orphans. A later sync plan would add its own store; this one does not.
