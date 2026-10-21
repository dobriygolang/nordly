# ADR 009 — Live whiteboard on the desktop

## Status

Accepted.

## Context

Sharing a board from the desktop app created a rooms session and opened the invite in the browser. The app threw away the owner token, so the local canvas never joined the Yjs room. Web clients synced with each other. The desktop canvas did not.

## Decision

1. The Yjs scene document and the editor websocket protocol live in `apps/shared/collab` (`@nordly-collab`). The web app and the desktop app both use that code.
2. After `POST /v1/rooms/share-whiteboard`, the desktop keeps `roomId`, `accessToken`, and `expiresIn` in memory only. It connects to `/ws/editor/{roomId}` with `Sec-WebSocket-Protocol: access_token.<JWT>`. When the socket opens it sends one Yjs snapshot of the seeded scene and the local awareness state. A failed upgrade includes the close code in the error. The rooms handler allows the Tauri webview origin; production `CORS_ALLOWED_ORIGINS` still lists the public HTTPS hosts.
3. While the session is open, the desktop canvas is view-only. It does not publish strokes and it does not paint remote strokes. The socket still applies Yjs ops into the in-memory document. Stop sharing, `room_closed`, or token expiry writes that document into the local board, paints it once, and disconnects. A failed socket is shown as an error. The board does not stay marked live. Drawing during the share happens in the browser.
4. An unknown websocket envelope closes the socket. A remote scene with more than 5000 elements, or a file that is not PNG, JPEG, GIF, or WebP, ends the session. Element links open only as `https` URLs through the system browser.
5. Production CSP allows `wss://trynordly.app` and `wss://code.trynordly.app`. Dev also allows `ws://localhost:8087`.
6. Web clients publish a pointer in the awareness channel. Excalidraw draws the other participants' cursors and names. A client does not draw its own cursor. The web board coalesces pointer updates to one animation frame. The desktop canvas does not publish a pointer and does not paint peer cursors.

## Consequences

The participant count is the awareness size. A second share replaces the in-memory session. Laser and selection pointers use the same channel.
