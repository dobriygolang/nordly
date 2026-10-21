# ADR 009 — Live whiteboard on the desktop

## Status

Accepted.

## Context

Sharing a board from the desktop app created a rooms session and opened the invite in the browser. The app threw away the owner token, so the local canvas never joined the Yjs room. Web clients synced with each other. The desktop canvas did not.

## Decision

1. The Yjs scene document and the editor websocket protocol live in `apps/shared/collab` (`@nordly-collab`). The web app and the desktop app both use that code.
2. After `POST /v1/rooms/share-whiteboard`, the desktop keeps `roomId`, `accessToken`, and `expiresIn` in memory only. It connects to `/ws/editor/{roomId}` with `Sec-WebSocket-Protocol: access_token.<JWT>`. When the socket opens it sends one Yjs snapshot of the seeded scene and the local awareness state. A failed upgrade includes the close code in the error. The rooms handler allows the Tauri webview origin; production `CORS_ALLOWED_ORIGINS` still lists the public HTTPS hosts.
3. While the session is open, the room is the scene. Local IndexedDB saves continue from the canvas, including remote edits. Stop sharing, `room_closed`, or token expiry writes the Yjs scene back into the local board and disconnects. A failed socket is shown as an error. The board does not stay marked live.
4. An unknown websocket envelope closes the socket. A remote scene with more than 5000 elements, or a file that is not PNG, JPEG, GIF, or WebP, ends the session. Element links open only as `https` URLs through the system browser.
5. Production CSP allows `wss://trynordly.app` and `wss://code.trynordly.app`. Dev also allows `ws://localhost:8087`.
6. Each client publishes a pointer in the awareness channel. Excalidraw draws the other participants' cursors and names. A client does not draw its own cursor. The desktop canvas keeps the last peer list and paints it again when the Excalidraw API mounts. The web board coalesces pointer updates to one animation frame.
7. In-progress strokes and edits publish as awareness field `draft` (coalesced to one animation frame). Peers merge remote drafts onto the committed Yjs scene for display. On gesture end (`pointerup` / no editing flags) the client clears `draft` and writes the full scene into Yjs once. Cursor-only awareness changes do not re-apply the scene.

## Consequences

The participant count is the awareness size. A second share replaces the in-memory session. Laser and selection pointers use the same channel. Mid-stroke realtime uses the same presence transport as cursors; durable scene history stays in Yjs ops/snapshots.
