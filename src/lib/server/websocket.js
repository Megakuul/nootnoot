import { WebSocket, WebSocketServer } from 'ws';
import { parse as parseUrl } from 'node:url';
import { env as privateEnv } from '$env/dynamic/private';

const GLOBAL_WSS = '__app_wss__';
const GLOBAL_CLIENTS = '__app_clients__';

/** @type {any} */
const g = globalThis;

if (!g[GLOBAL_CLIENTS]) {
	g[GLOBAL_CLIENTS] = new Map();
}

/** @type {Map<string, { ws: WebSocket, data: any, lastUpdated: Date, originalId: string | null, captures?: Array<{image: string, detection: any, location: any, timestamp: string}> }>} */
const clients = /** @type {any} */ (g)[GLOBAL_CLIENTS];

/** @type {WebSocketServer | undefined} */
let wss = /** @type {any} */ (g)[GLOBAL_WSS];

// Expected auth token from environment
const AUTH_TOKEN = privateEnv.WS_AUTH_TOKEN || null;
if (!AUTH_TOKEN) {
	console.warn('[WS] No WS_AUTH_TOKEN set; connections are not authenticated.');
}

function startServer() {
	if (wss) {
		console.log('Reusing existing WebSocket server on port 8080');
		return wss;
	}

	try {
	const server = new WebSocketServer({ port: 8080 });
		wss = server;
	/** @type {any} */ (g)[GLOBAL_WSS] = server;
		console.log('WebSocket server started on port 8080');

		server.on('connection', (ws, req) => {
			// Simple token check: support query ?token=... or Authorization: Bearer ... for non-browser clients
			let isAuthorized = true;
			if (AUTH_TOKEN) {
				isAuthorized = false;
				try {
					const url = parseUrl(req.url || '/', true);
					const qToken = url?.query?.token;
					const authHeader = /** @type {string | undefined} */ (req.headers?.authorization);
					const bearer = authHeader && authHeader.toLowerCase().startsWith('bearer ')
						? authHeader.slice(7)
						: undefined;
					if (qToken === AUTH_TOKEN || bearer === AUTH_TOKEN) {
						isAuthorized = true;
					}
				} catch {}
			}

			if (!isAuthorized) {
				try { ws.close(1008, 'Invalid or missing auth token'); } catch {}
				return;
			}

			console.log('New WebSocket connection established');

			ws.on('message', (data) => {
				try {
					const message = JSON.parse(data.toString());
					let { clientId, type, payload } = message;

					if (type === 'detection-data') {
						if (clients.has(clientId)) {
							const existingClient = clients.get(clientId);
							if (existingClient && existingClient.ws !== ws && existingClient.ws.readyState === WebSocket.OPEN) {
								let suffix = 1;
								let newClientId = `${clientId}-conflict-${suffix}`;
								while (clients.has(newClientId)) {
									suffix++;
									newClientId = `${clientId}-conflict-${suffix}`;
								}
								console.log(`ID conflict detected! Reassigning ${clientId} to ${newClientId}`);
								clientId = newClientId;

								if (ws.readyState === WebSocket.OPEN) {
									ws.send(JSON.stringify({
										type: 'id-reassignment',
										newClientId: clientId,
										reason: 'ID conflict resolved'
									}));
								}
							}
						}

						const prev = clients.get(clientId);
						clients.set(clientId, {
							ws,
							data: payload,
							lastUpdated: new Date(),
							originalId: message.clientId !== clientId ? message.clientId : null,
							captures: prev?.captures ?? []
						});

						console.log(`Received detection data from client ${clientId}:`, payload);
						broadcastToGatherClients();
					} else if (type === 'capture') {
						// payload: { location, detection, image, timestamp }
						const existing = clients.get(clientId);
						const entry = existing ?? { ws, data: {}, lastUpdated: new Date(), originalId: null, captures: [] };
						entry.captures = entry.captures || [];
						// keep last 20 captures
						entry.captures.push({
							image: payload?.image,
							detection: payload?.detection,
							location: payload?.location,
							timestamp: payload?.timestamp ?? new Date().toISOString()
						});
						while (entry.captures.length > 20) entry.captures.shift();
						entry.ws = ws;
						entry.lastUpdated = new Date();
						clients.set(clientId, entry);
						console.log(`Received capture from ${clientId}`);
						broadcastToGatherClients();
					}
				} catch (error) {
					console.error('Error parsing WebSocket message:', error);
				}
			});

			ws.on('close', () => {
				for (const [clientId, client] of clients.entries()) {
					if (client.ws === ws) {
						clients.delete(clientId);
						console.log(`Client ${clientId} disconnected`);
						broadcastToGatherClients();
						break;
					}
				}
			});
		});

		server.on('error', (err) => {
			const e = /** @type {any} */ (err);
			if (e && e.code === 'EADDRINUSE') {
				console.warn('Port 8080 already in use. If another instance is running, reusing that.');
			} else {
				console.error('WebSocket server error:', err);
			}
		});

		return server;
	} catch (err) {
		const e = /** @type {any} */ (err);
		if (e && e.code === 'EADDRINUSE') {
			console.warn('Port 8080 already in use. Continuing without creating a new WebSocket server.');
			return /** @type {any} */ (g)[GLOBAL_WSS];
		}
		throw err;
	}
}

function broadcastToGatherClients() {
	if (!wss) return;
	/** @type {Record<string, any>} */
	const clientData = {};
	for (const [clientId, client] of clients.entries()) {
		clientData[clientId] = { ...client.data, captures: client.captures ?? [] };
	}

	wss.clients.forEach((client) => {
		if (client.readyState === WebSocket.OPEN) {
			client.send(JSON.stringify({
				type: 'clients-update',
				data: clientData
			}));
		}
	});
}

wss = startServer();

export { wss };