NootNoot

Securing WebSocket access with a token
- Overview: The built-in WebSocket server (port 8080) can enforce a shared secret token so only authorized clients send/receive detection streams.

Setup
- Create `.env` at the project root (copy from `.env.example`).
- Set both variables to the same value:
	- `WS_AUTH_TOKEN=your-secret` (server-side, not exposed)
	- `PUBLIC_WS_TOKEN=your-secret` (exposed to browser, used by pages)

Run
- Start the dev server:
	- Linux/macOS:
		- `WS_AUTH_TOKEN=your-secret PUBLIC_WS_TOKEN=your-secret npm run dev`
	- Or place them in `.env` and run `npm run dev`.

How it works
- Server: `src/lib/server/websocket.js` reads `WS_AUTH_TOKEN` and validates each connection.
	- Clients must send the token either as a query param `?token=...` or via `Authorization: Bearer ...` header.
- Browser clients: `src/routes/detect/+page.svelte` and `src/routes/gather/+page.svelte` append `?token=${PUBLIC_WS_TOKEN}` and auto-select `ws://` or `wss://` based on page protocol.

Troubleshooting
- If you set `WS_AUTH_TOKEN` but not `PUBLIC_WS_TOKEN`, connections from the browser will be closed with code 1008.
- If no `WS_AUTH_TOKEN` is configured, the server logs a warning and accepts all connections (not secure).
