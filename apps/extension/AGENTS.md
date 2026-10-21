# AGENTS.md — Nordly Chrome extension

Unpacked Manifest V3 side panel. It does not log in and it does not call the notes API. The desktop app listens on `127.0.0.1:47231` and writes the card line into the local note.

Build from the desktop app, which already has Vite:

```bash
cd apps/nordly && npm run extension:build
```

A desktop build copies `dist` into the Nordly app, and Settings → Browser opens that copy. For local development, load `apps/extension/dist` in Chrome. Pair it with the code in Nordly settings → Browser. Turn on flashcards, then in a note’s menu turn on “Save words here”. Enter translates the whole field once through MyMemory (up to five unique matches, comma-separated, all lowercase) and appends `word ::: translation` or `word :: translation` (panel toggle) to that note. The word field stays filled after translate. Recent lines show under the status as `word - translation`. If Nordly is closed or the vault is locked, the line waits in `chrome.storage`.
