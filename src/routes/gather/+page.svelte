<script>
	import { onMount } from 'svelte';
	import { MapLibre, Marker, Popup } from 'svelte-maplibre-gl';
	import 'maplibre-gl/dist/maplibre-gl.css';
	
	/** @type {Map<string, { location?: { latitude?: number, longitude?: number }, settings?: { angle?: number, fov?: number, rotation?: number, scale?: number }, detections?: Array<{class: string, score: number, image?: string, box?: [number, number, number, number]}>, objectSizes?: Record<string, number>, timestamp?: string, lastUpdated?: Date, captures?: Array<any> }>} */
	let clients = $state(new Map()); // Store data by client ID

	/** @type {WebSocket | null} */
	let ws = null;
	// Auth token state
	let token = $state('');
	let needsToken = $state(false);
	let authError = $state('');
	/** @type {import('maplibre-gl').Map | undefined} */
	let map = $state();
	let didInitialFit = false;
	let openDetKey = $state(null);
	
	// Map configuration
	const mapStyle = 'https://tiles.stadiamaps.com/styles/outdoors.json'; // Free detailed map style
	/** @type {[number, number]} */
	const initialCenter = [8.5417, 47.3769]; // Zurich, Switzerland as default
	const initialZoom = 10;
	// Visibility toggles for detection classes (defined below with filters)


	// Detection rendering config (fallbacks; ideally sent by client)
	const FRAME_WIDTH = 640; // assumed frame width for bbox normalization
	const DEFAULT_OBJECT_SIZES = { bird: 1, airplane: 20 };
	const DEFAULT_SCALE = 30000; // baseline if client doesn't send scale

	// Visibility & filters
	let showBirds = $state(true);
	let showAirplanes = $state(true);
	let showMisc = $state(true);
	let minScore = $state(0.2);

	// Stable key for detections to avoid marker reuse glitches
	function detKey(det, i) {
		const b = Array.isArray(det?.box) ? det.box : [];
		const bx = Math.round(b[1] || 0);
		const by = Math.round(b[0] || 0);
		const bw = Math.round(b[3] || 0);
		const bh = Math.round(b[2] || 0);
		return `${(det?.class || 'unknown').toLowerCase()}:${bx},${by},${bw},${bh}:${i}`;
	}

	// Simple trails storage: key = `${clientId}:${class}` -> Array<[lng, lat]>
	let trails = $state(new Map());

	/** Compute horizontal angle from bbox center */
	function horizontalAngleRad(box, fovDeg) {
		// box: [y, x, h, w]
		const xCenter = box[1] + box[3] / 2;
		const half = FRAME_WIDTH / 2;
		const norm = (xCenter - half) / half; // -1..1
		const halfFovRad = (fovDeg / 2) * Math.PI / 180;
		return Math.atan(norm * Math.tan(halfFovRad));
	}

	/** Bearing (deg) and distance (m) estimate for detection */
	function detectionPolar(detection, settings, objectSizes) {
		const fov = settings?.fov ?? 70;
		const rotation = settings?.rotation ?? 0; // deg
		const angleRad = horizontalAngleRad(detection.box, fov);
		const bearingDeg = rotation + (angleRad * 180) / Math.PI;
		const size = Math.max(detection.box[2], detection.box[3]);
		const sizes = objectSizes ?? DEFAULT_OBJECT_SIZES;
		const base = sizes[(detection.class || '').toLowerCase()] ?? 1;
		const scale = settings?.scale ?? DEFAULT_SCALE;
		const distance = Math.max(50, (base / Math.max(1, size)) * scale);
		return { bearingDeg, distance };
	}

	/** Destination point given start, bearing deg and distance meters */
	function destination(lat, lng, bearingDeg, distanceMeters) {
		const R = 6371000; // Earth radius in meters
		const δ = distanceMeters / R;
		const θ = bearingDeg * Math.PI / 180;
		const φ1 = lat * Math.PI / 180;
		const λ1 = lng * Math.PI / 180;
		const sinφ2 = Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ);
		const φ2 = Math.asin(sinφ2);
		const y = Math.sin(θ) * Math.sin(δ) * Math.cos(φ1);
		const x = Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2);
		const λ2 = λ1 + Math.atan2(y, x);
		return { lat: (φ2 * 180) / Math.PI, lng: (λ2 * 180) / Math.PI };
	}

	/** Whether to render a detection based on class visibility */
	function isVisibleDetection(det) {
		const cls = (det.class || '').toLowerCase();
		if (cls === 'bird') return showBirds;
		if (cls === 'airplane' || cls === 'aeroplane' || cls === 'plane') return showAirplanes;
		return showMisc;
	}

	function computeDestForDet(lat, lng, det, settings, objectSizes) {
		const { bearingDeg, distance } = detectionPolar(det, settings, objectSizes);
		const dest = destination(lat, lng, bearingDeg, distance);
		return [dest.lng, dest.lat];
	}

	// removed image helpers; no image display or caching
	
	// Connect to WebSocket server
	function connectWebSocket() {
		try {
			const host = (typeof window !== 'undefined' && window.location && window.location.hostname) ? window.location.hostname : 'localhost';
            const protocol = (typeof window !== 'undefined' && window.location && window.location.protocol === 'https:') ? 'wss' : 'ws';
			const qs = token ? `?token=${encodeURIComponent(String(token))}` : '';
			ws = new WebSocket(`${protocol}://${host}:8080${qs}`);
			
			ws.onopen = () => {
				console.log('Gather page connected to WebSocket server');
				needsToken = false;
				authError = '';
			};
			
			ws.onmessage = (event) => {
				const message = JSON.parse(event.data);
				if (message.type === 'clients-update') {
					// Update clients data
					const newClients = new Map();
					for (const [clientId, data] of Object.entries(message.data)) {
						newClients.set(clientId, {
							...data,
							lastUpdated: new Date(data.timestamp)
						});

						// Update trails for detections above threshold
						if (data.location?.latitude && data.location?.longitude && Array.isArray(data.detections)) {
							for (const det of data.detections) {
								if (typeof det.score === 'number' && det.score >= minScore) {
									const { bearingDeg, distance } = detectionPolar(det, data.settings, data.objectSizes);
									const dest = destination(data.location.latitude, data.location.longitude, bearingDeg, distance);
									const key = `${clientId}:${(det.class || 'unknown').toLowerCase()}`;
									if (!trails.has(key)) trails.set(key, []);
									const arr = trails.get(key);
									arr.push([dest.lng, dest.lat]);
									while (arr.length > 10) arr.shift();
								}
							}
						}
					}
					clients = newClients;
					console.log('Updated clients data:', message.data);
					
					// Only auto-fit once when clients first appear
					if (!didInitialFit && clients.size > 0) {
						fitMapToClients();
						didInitialFit = true;
					}
				}
			};
			
			ws.onclose = (ev) => {
				console.log('WebSocket connection closed, attempting to reconnect...', ev.code, ev.reason);
				if (ev.code === 1008) {
					needsToken = true;
					authError = 'Authentication required. Please enter a valid token.';
				} else {
					setTimeout(connectWebSocket, 3000);
				}
			};
			
			ws.onerror = (error) => {
				console.error('WebSocket error:', error);
			};
		} catch (error) {
			console.error('Failed to connect to WebSocket:', error);
		}

		function submitToken() {
			try { localStorage.setItem('ws-token', token || ''); } catch {}
			try { ws && ws.close(); } catch {}
			connectWebSocket();
		}
	}
	
	// Function to fit map bounds to show all clients
	function fitMapToClients() {
		if (!map || clients.size === 0) return;
		let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
		for (const [, data] of clients.entries()) {
			const lat = data.location?.latitude;
			const lng = data.location?.longitude;
			if (typeof lat === 'number' && typeof lng === 'number') {
				minLng = Math.min(minLng, lng);
				minLat = Math.min(minLat, lat);
				maxLng = Math.max(maxLng, lng);
				maxLat = Math.max(maxLat, lat);
			}
		}
		if (isFinite(minLng) && isFinite(minLat) && isFinite(maxLng) && isFinite(maxLat)) {
			/** @type {import('maplibre-gl').LngLatBoundsLike} */
			const bounds = [minLng, minLat, maxLng, maxLat];
			map.fitBounds(bounds, { padding: 50 });
		}
	}
	
	// Function to get marker color based on data freshness
	/** @param {Date} lastUpdated */
	function getMarkerColor(lastUpdated) {
		const now = new Date();
		const timeDiff = Number(now) - Number(lastUpdated);
		const seconds = timeDiff / 1000;
		
		if (seconds < 5) return '#4CAF50'; // Green - very fresh
		if (seconds < 30) return '#FFC107'; // Yellow - recent
		if (seconds < 120) return '#FF9800'; // Orange - getting old
		return '#F44336'; // Red - stale
	}
	
	onMount(() => {
		console.log('Setting up WebSocket connection for gathering data...');
		try { token = localStorage.getItem('ws-token') || ''; } catch {}
		connectWebSocket();
		
		// Cleanup on component destroy
		return () => {
			if (ws) {
				ws.close();
			}
		};
	});
</script>

{#snippet cameraPin()}
<div class="camera-marker"><i class="fas fa-camera"></i></div>
{/snippet}

{#snippet airplanePin()}
<div class="detection-pin airplane"><i class="fa-solid fa-plane"></i></div>
{/snippet}

{#snippet birdPin()}
<div class="detection-pin bird"><i class="fa-solid fa-crow"></i></div>
{/snippet}

{#snippet genericPin()}
<div class="detection-pin"><i class="fa-solid fa-circle-dot"></i></div>
{/snippet}

{#snippet trailPin()}
<div class="trail-pin"></div>
{/snippet}

<svelte:head>
	<title>Detection Data Gathering</title>
</svelte:head>

<div class="page">
	<div class="header">
		<div class="brand">
			<img src="/jedsy-logo-main.png" alt="Jedsy" class="brand-logo" />
			<h1>Live Detection Data</h1>
		</div>
		<div class="stats">
			<span class="stat-item">
				<i class="fas fa-users"></i>
				Active Clients: {clients.size}
			</span>
			<button class="fit-bounds-btn" onclick={fitMapToClients} disabled={clients.size === 0}>
				<i class="fas fa-expand-arrows-alt"></i>
				Fit to Clients
			</button>
		</div>
	</div>
	
	<div class="map-container">
		<MapLibre
			bind:map
			style={mapStyle}
			center={initialCenter}
			zoom={initialZoom}
			class="map"
			on:click={() => (openDetKey = null)}
		>
			{#each [...clients.entries()] as [clientId, data]}
				{#if data.location?.latitude && data.location?.longitude}
					<Marker
						lnglat={[data.location.longitude, data.location.latitude]}
						class="client-marker"
						content={cameraPin}
					>
						<div style="display:none"></div>
						
						<Popup offset={[0, -10]} closeButton={false}>
							<div class="popup-content">
								<h4>Client: {clientId.substring(0, 12)}...</h4>
								<div class="popup-info">
									<p><strong>Location:</strong><br>
									{data.location.latitude.toFixed(6)}, {data.location.longitude.toFixed(6)}</p>
									
									<p><strong>Camera Settings:</strong><br>
									Angle: {data.settings?.angle ?? 'N/A'}° | 
									FOV: {data.settings?.fov ?? 'N/A'}° | 
									Rotation: {data.settings?.rotation ?? 'N/A'}°</p>
									
									<p><strong>Detections:</strong> {Array.isArray(data.detections) ? data.detections.length : 0} objects</p>

									{#if Array.isArray(data.detections) && data.detections.length > 0}
										<div class="detections">
						{#each data.detections as det, i (detKey(det, i))}
							<span class="detection-tag">{det.class} ({(det.score * 100).toFixed(1)}%)</span>
											{/each}
										</div>
									{/if}
									
									<p class="timestamp">Updated: {data.lastUpdated?.toLocaleTimeString()}</p>
								</div>
							</div>
						</Popup>
					</Marker>

						{#if Array.isArray(data.detections) && data.detections.length > 0}
							{#each data.detections as det, i (detKey(det, i))}
		{#if isVisibleDetection(det) && (typeof det.score !== 'number' || det.score >= minScore)}
									{#if (det.class || '').toLowerCase() === 'airplane'}
										<Marker on:click={() => (openDetKey = detKey(det, i))} lnglat={computeDestForDet(data.location.latitude, data.location.longitude, det, data.settings, data.objectSizes)} class="detection-marker" content={airplanePin}>
											<div style="display:none"></div>
											<Popup offset={[0, -10]} closeButton={false} open={openDetKey === detKey(det, i)}>
												<div class="popup-content">
													<strong>{det.class}</strong> {(det.score * 100).toFixed(1)}%

												</div>
											</Popup>
										</Marker>
									{:else if (det.class || '').toLowerCase() === 'bird'}
										<Marker on:click={() => (openDetKey = detKey(det, i))} lnglat={computeDestForDet(data.location.latitude, data.location.longitude, det, data.settings, data.objectSizes)} class="detection-marker" content={birdPin}>
											<div style="display:none"></div>
											<Popup offset={[0, -10]} closeButton={false} open={openDetKey === detKey(det, i)}>
												<div class="popup-content">
													<strong>{det.class}</strong> {(det.score * 100).toFixed(1)}%

												</div>
											</Popup>
										</Marker>
									{:else}
										<Marker on:click={() => (openDetKey = detKey(det, i))} lnglat={computeDestForDet(data.location.latitude, data.location.longitude, det, data.settings, data.objectSizes)} class="detection-marker" content={genericPin}>
											<div style="display:none"></div>
											<Popup offset={[0, -10]} closeButton={false} open={openDetKey === detKey(det, i)}>
												<div class="popup-content">
													<strong>{det.class}</strong> {(det.score * 100).toFixed(1)}%

												</div>
											</Popup>
										</Marker>
									{/if}
								{/if}
							{/each}
						{/if}

					{#each [...trails.entries()] as [trailKey, coords]}
						{#if trailKey.startsWith(clientId + ':')}
							{#if (trailKey.endsWith(':airplane') && showAirplanes) || (trailKey.endsWith(':bird') && showBirds) || (!trailKey.endsWith(':airplane') && !trailKey.endsWith(':bird') && showMisc)}
								{#each coords as t}
									<Marker lnglat={t} content={trailPin} class="trail-marker" />
								{/each}
							{/if}
						{/if}
					{/each}
				{/if}
			{/each}
		</MapLibre>
	</div>

	<div class="legend">
		<div class="legend-row">
			<span class="legend-icon camera"><i class="fa-solid fa-camera"></i></span>
			<span class="legend-label">Camera</span>
		</div>
		<label class="legend-row">
			<input type="checkbox" bind:checked={showBirds} />
			<span class="legend-icon bird"><i class="fa-solid fa-crow"></i></span>
			<span class="legend-label">Birds</span>
		</label>
		<label class="legend-row">
			<input type="checkbox" bind:checked={showAirplanes} />
			<span class="legend-icon airplane"><i class="fa-solid fa-plane"></i></span>
			<span class="legend-label">Airplanes</span>
		</label>
		<label class="legend-row">
			<input type="checkbox" bind:checked={showMisc} />
			<span class="legend-icon misc"><i class="fa-solid fa-circle-dot"></i></span>
			<span class="legend-label">Misc</span>
		</label>
		<div class="legend-row">
			<label class="legend-label" for="minScore">Min score</label>
			<input id="minScore" type="range" min="0" max="1" step="0.05" bind:value={minScore} />
			<span>{minScore.toFixed(2)}</span>
		</div>
	</div>
	
	{#if clients.size === 0}
		<div class="no-clients">
			<i class="fas fa-satellite-dish"></i>
			<p>No active detection clients</p>
			<small>Start a detection session to see clients on the map</small>
		</div>
	{/if}

	{#if needsToken}
	<div class="token-overlay">
		<div class="token-card">
			<h3><i class="fa-solid fa-lock"></i> WebSocket Authentication</h3>
			{#if authError}<div class="error">{authError}</div>{/if}
			<label>Token
				<input type="password" bind:value={token} placeholder="Enter token" />
			</label>
			<div class="actions">
				<button class="primary" onclick={submitToken}>Connect</button>
			</div>
		</div>
	</div>
	{/if}
</div>

<style>
	.page {
		height: 100vh;
		display: flex;
		flex-direction: column;
		margin: 0;
		padding: 0;
		background: #f5f5f5;
	}
	
	.header {
		background: white;
		padding: 1rem 2rem;
		box-shadow: 0 2px 4px rgba(0,0,0,0.1);
		display: flex;
		justify-content: space-between;
		align-items: center;
		z-index: 10;
	}

	.brand {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.brand-logo {
		height: 32px;
		width: auto;
		display: block;
	}
	
	.header h1 {
		margin: 0;
		color: #333;
		font-size: 1.5rem;
	}
	
	.stats {
		display: flex;
		align-items: center;
		gap: 1rem;
	}
	
	.stat-item {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		background: #e3f2fd;
		padding: 0.5rem 1rem;
		border-radius: 20px;
		font-weight: 500;
		color: #1565c0;
	}
	
	.fit-bounds-btn {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 1rem;
		background: #4caf50;
		color: white;
		border: none;
		border-radius: 6px;
		cursor: pointer;
		transition: all 0.2s ease;
	}
	
	.fit-bounds-btn:hover:not(:disabled) {
		background: #45a049;
	}
	
	.fit-bounds-btn:disabled {
		background: #ccc;
		cursor: not-allowed;
	}
	
	.map-container {
		flex: 1;
		position: relative;
		margin: 0;
	}
	
	:global(.map) {
		width: 100%;
		height: 100%;
	}
	
	:global(.camera-marker) {
		width: 30px;
		height: 30px;
		border-radius: 8px;
		display: flex;
		align-items: center;
		justify-content: center;
		border: 3px solid white;
		box-shadow: 0 2px 8px rgba(0,0,0,0.3);
		cursor: pointer;
		transition: all 0.2s ease;
		background-color: #000b;
	}
	
	:global(.camera-marker:hover) {
		transform: scale(1.1);
	}
	
	:global(.camera-marker i) {
		color: white;
		font-size: 12px;
		font-weight: bold;
	}

	:global(.detection-pin) {
		width: 18px;
		height: 18px;
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		background: #222;
		border: 2px solid white;
		box-shadow: 0 1px 4px rgba(0,0,0,0.25);
		z-index: 3;
		pointer-events: auto;
		cursor: pointer;
	}
	:global(.detection-pin i) {
		color: #fff;
		font-size: 10px;
	}
	:global(.detection-pin.airplane) { background: #1976d2; }
	:global(.detection-pin.bird) { background: #43a047; }
	:global(.trail-pin) {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: rgba(25,118,210,0.4);
		border: 1px solid rgba(255,255,255,0.8);
		pointer-events: none; /* don't block clicks on actual markers */
	}
	:global(.trail-marker) { pointer-events: none; z-index: 1; }
	:global(.detection-marker) { z-index: 4; pointer-events: auto; }

	.legend {
		position: absolute;
		bottom: 16px;
		left: 16px;
		background: #fff;
		border-radius: 8px;
		box-shadow: 0 2px 8px rgba(0,0,0,0.15);
		padding: 8px 12px;
		font-size: 12px;
		color: #333;
		z-index: 20;
	}
	.legend-row {
		display: flex;
		align-items: center;
		gap: 8px;
		margin: 4px 0;
	}
	.legend-icon.camera {
		background: #888;
		color: #fff;
		border-radius: 6px;
		width: 20px;
		height: 20px;
		display: inline-flex;
		align-items: center;
		justify-content: center;
	}
	.legend-icon.bird { color: #43a047; }
	.legend-icon.airplane { color: #1976d2; }
	
	.popup-content {
		max-width: 300px;
	}

	
	.popup-content h4 {
		margin: 0 0 0.5rem 0;
		color: #333;
		font-size: 1rem;
		border-bottom: 1px solid #eee;
		padding-bottom: 0.5rem;
	}
	
	.popup-info p {
		margin: 0.5rem 0;
		font-size: 0.875rem;
		line-height: 1.4;
	}
	
	.detections {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem;
		margin: 0.5rem 0;
	}

	.detection-tag {
		background: #4caf50;
		color: white;
		padding: 0.125rem 0.375rem;
		border-radius: 12px;
		font-size: 0.75rem;
		font-weight: 500;
	}
	
	.timestamp {
		font-size: 0.75rem !important;
		color: #666 !important;
		margin-top: 0.5rem !important;
		border-top: 1px solid #eee;
		padding-top: 0.5rem !important;
	}
	
	.no-clients {
		position: absolute;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		text-align: center;
		background: white;
		padding: 2rem;
		border-radius: 12px;
		box-shadow: 0 4px 12px rgba(0,0,0,0.15);
		z-index: 10;
	}
	
	.no-clients i {
		font-size: 3rem;
		color: #ccc;
		margin-bottom: 1rem;
	}
	
	.no-clients p {
		margin: 0.5rem 0;
		color: #666;
		font-size: 1.1rem;
	}
	
	.no-clients small {
		color: #999;
		font-size: 0.875rem;
	}
</style>
