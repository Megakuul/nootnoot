<script>
	import { onMount, tick } from 'svelte';
	import { MapLibre, Marker, Popup } from 'svelte-maplibre-gl';
	import 'maplibre-gl/dist/maplibre-gl.css';
	import ObjectDetection from '$lib/ObjectDetection.svelte';
	import Settings from '$lib/CameraSettings.svelte';
	import { config } from '$lib/config.js';

	let clientId = '';
	let location = null;
	let ws = null;
	let relocateMode = false;
	let selectedDetection = null;
	let objectDetectionComp;

	// Auth token state (shown only if required by server)
	let token = '';
	let needsToken = false;
	let authError = '';

	// Removed image transfer/snipping; no capture throttling

	// Map state
	/** @type {import('maplibre-gl').Map | undefined} */
	let map;
	let pageVisible = false; // mount map only when tab is visible
	let containerHasSize = false; // gate map mount until container has dimensions
	let videoSourceNone = true; // collapse spacing when source is 'none'
	const mapStyle = 'https://tiles.stadiamaps.com/styles/outdoors.json';
	/** @type {HTMLDivElement | undefined} */
	let mapContainer;
	/** @type {[number, number]} */
	let center = [8.5417, 47.3769]; // default Zurich
	let zoom = 12;

	// Detection visibility and filters
	let showBirds = true;
	let showAirplanes = true;
	let minScore = 0.2;

	// Latest detections from local ObjectDetection
	/** @type {Array<{class: string, score: number, box: [number, number, number, number]}>> */
	let latestDetections = [];

	// Generate or retrieve persistent client ID
	function generateClientId() {
		let id = localStorage.getItem('client-id');
		if (!id) {
			// Create a truly unique ID using crypto.randomUUID() if available,
			// otherwise fallback to a more robust random generation
			if (crypto.randomUUID) {
				id = 'client-' + crypto.randomUUID();
			} else {
				// Fallback for older browsers - use multiple random sources
				const timestamp = Date.now();
				const random1 = Math.random().toString(36).substring(2, 15);
				const random2 = Math.random().toString(36).substring(2, 15);
				const performanceTime = performance.now().toString().replace('.', '');
				id = `client-${timestamp}-${random1}-${random2}-${performanceTime}`;
			}
			localStorage.setItem('client-id', id);
		}
		return id;
	}

	// Connect to WebSocket server
	function connectWebSocket() {
		try {
			const host = (typeof window !== 'undefined' && window.location && window.location.hostname) ? window.location.hostname : 'localhost';
            const protocol = (typeof window !== 'undefined' && window.location && window.location.protocol === 'https:') ? 'wss' : 'ws';
			const qs = token ? `?token=${encodeURIComponent(String(token))}` : '';
			ws = new WebSocket(`${protocol}://${host}:8080${qs}`);
			
			ws.onopen = () => {
				console.log('Connected to WebSocket server');
				needsToken = false;
				authError = '';
			};
			
			ws.onmessage = (event) => {
				const message = JSON.parse(event.data);
				console.log('Received from server:', message);
				
				// Handle ID reassignment from server
				if (message.type === 'id-reassignment') {
					console.log(`Client ID reassigned from ${clientId} to ${message.newClientId}: ${message.reason}`);
					clientId = message.newClientId;
					// Update localStorage with the new ID
					localStorage.setItem('client-id', clientId);
				}
			};
			
			ws.onclose = (ev) => {
				console.log('WebSocket connection closed', ev.code, ev.reason);
				if (ev.code === 1008) {
					// Policy violation => likely missing/invalid token
					needsToken = true;
					authError = 'Authentication required. Please enter a valid token.';
				} else {
					// Attempt to reconnect after 3 seconds
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
			if (typeof localStorage !== 'undefined') {
				localStorage.setItem('ws-token', token || '');
			}
			try { ws && ws.close(); } catch {}
			connectWebSocket();
		}
	}

	// Compute horizontal angle from bbox center
	function horizontalAngleRad(box, fovDeg) {
		const FRAME_WIDTH = 640;
		const xCenter = box[1] + box[3] / 2;
		const half = FRAME_WIDTH / 2;
		const norm = (xCenter - half) / half; // -1..1
		const halfFovRad = (fovDeg / 2) * Math.PI / 180;
		return Math.atan(norm * Math.tan(halfFovRad));
	}

	// Bearing (deg) and distance (m) estimate for detection
	function detectionPolar(detection, settings, objectSizes) {
		const DEFAULT_OBJECT_SIZES = { bird: 1, airplane: 20 };
		const DEFAULT_SCALE = 30000;
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

	// Destination point given start, bearing deg and distance meters
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

	function computeDestForDet(lat, lng, det, settings, objectSizes) {
		const { bearingDeg, distance } = detectionPolar(det, settings, objectSizes);
		const dest = destination(lat, lng, bearingDeg, distance);
		return [dest.lng, dest.lat];
	}

	function isVisibleDetection(det) {
		const cls = (det.class || '').toLowerCase();
		if (cls === 'bird') return showBirds;
		if (cls === 'airplane' || cls === 'aeroplane' || cls === 'plane') return showAirplanes;
		return true;
	}

	function recenterMap() {
		if (!map || !location?.latitude || !location?.longitude) return;
		map.setCenter([location.longitude, location.latitude]);
		map.setZoom(13);
	}

	let handleMapClick;
	$: if (map) {
		map.getCanvas().style.cursor = relocateMode ? 'crosshair' : '';
		if (relocateMode && !handleMapClick) {
			handleMapClick = (e) => {
				const lng = e.lngLat.lng;
				const lat = e.lngLat.lat;
				location = { latitude: lat, longitude: lng, accuracy: 0, timestamp: new Date() };
				recenterMap();
				relocateMode = false;
			};
			map.on('click', handleMapClick);
		} else if (!relocateMode && handleMapClick) {
			map.off('click', handleMapClick);
			handleMapClick = undefined;
		}
	}

	// Rely on svelte-maplibre-gl for cleanup; avoid double-removal errors

	// Send detection data to server and update local state
	function sendDetectionData(detections) {
		latestDetections = Array.isArray(detections) ? detections : [];
		// Do not attach images; only send class/score/box
		const detectionsToSend = latestDetections.map((d) => ({ class: d.class, score: d.score, box: d.box }));
		if (ws && ws.readyState === WebSocket.OPEN) {
			const message = {
				clientId,
				type: 'detection-data',
				payload: {
					location,
					settings: {
						angle: $config.camera.angle,
						fov: $config.camera.fov,
						rotation: $config.camera.rotation,
						scale: $config.camera.scale
					},
					objectSizes: $config.objectSizes,
					detections: detectionsToSend,
					timestamp: new Date()
				}
			};
			ws.send(JSON.stringify(message));
			console.log('Sent detection data:', message);
		}
	}

// Handle click event from ObjectDetection: show info only (no capture)
function handleDetectionClick(e) {
	const d = e?.detail?.detection;
	if (!d) return;
	selectedDetection = { class: d.class, score: d.score };
}

// Removed captureFromDet; no image capture or transfers

	onMount(async () => {
		// Track initial page visibility (important on mobile with multiple tabs)
		pageVisible = typeof document !== 'undefined' ? document.visibilityState === 'visible' : true;

		// Generate client ID
		clientId = generateClientId();
		console.log('Client ID generated:', clientId);

		// Load saved token if any
		try { token = localStorage.getItem('ws-token') || ''; } catch {}

		// Connect to WebSocket
		connectWebSocket();

		// Collect location when the detect page loads
		if (navigator.geolocation) {
			navigator.geolocation.getCurrentPosition(
				(position) => {
					location = {
						latitude: position.coords.latitude,
						longitude: position.coords.longitude,
						accuracy: position.coords.accuracy,
						timestamp: new Date(position.timestamp)
					};
					console.log('Location collected:', location);
				},
				(error) => {
					console.error('Error collecting location:', error.message);
				},
				{
					enableHighAccuracy: true,
					timeout: 10000,
					maximumAge: 60000
				}
			);
		} else {
			console.error('Geolocation is not supported by this browser');
		}

		// Ensure map resizes after first paint and when page becomes visible
		await tick();
		if (map) map.resize();

		const handleVisibility = () => {
			pageVisible = document.visibilityState === 'visible';
			if (pageVisible) {
				// Next tick so MapLibre mounts before resize
				tick().then(() => { if (map) { map.resize(); recenterMap(); } });
			}
		};
		const handleFocus = () => { if (map) map.resize(); };
		const handleWinResize = () => { if (map) map.resize(); };
		document.addEventListener('visibilitychange', handleVisibility);
		window.addEventListener('focus', handleFocus);
		window.addEventListener('resize', handleWinResize);

		// Double-tap resize to catch late layout
		requestAnimationFrame(() => { if (map) map.resize(); });
		setTimeout(() => { if (map) map.resize(); }, 250);
		setTimeout(() => { if (map) map.resize(); }, 1000);

		// Observe container size/visibility
		let ro;
		if (mapContainer && typeof ResizeObserver !== 'undefined') {
			ro = new ResizeObserver((entries) => {
				for (const entry of entries) {
					const cr = entry.contentRect;
					containerHasSize = (cr.width ?? 0) > 0 && (cr.height ?? 0) > 0;
				}
				if (map) map.resize();
			});
			ro.observe(mapContainer);
		}
		let io;
		if (mapContainer && typeof IntersectionObserver !== 'undefined') {
			io = new IntersectionObserver((entries) => {
				for (const e of entries) {
					if (e.isIntersecting && map) map.resize();
				}
			}, { root: null, threshold: [0, 0.01, 0.1, 1] });
			io.observe(mapContainer);
		}

		// Cleanup WebSocket on component destroy
		return () => {
			if (ws) {
				ws.close();
			}
			document.removeEventListener('visibilitychange', handleVisibility);
			window.removeEventListener('focus', handleFocus);
			window.removeEventListener('resize', handleWinResize);
			if (ro) ro.disconnect();
			if (io) io.disconnect();
		};
	});
</script>

<svelte:window
	on:pageshow={() => { pageVisible = true; tick().then(() => { if (map) { map.resize(); recenterMap(); } }); }}
	on:pagehide={() => { pageVisible = false; }}
/>

<svelte:head>
	<title>Object Detection</title>
</svelte:head>

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

<div class="page">
	<div class="header">
		<div class="brand">
			<img src="/jedsy-logo-main.png" alt="Jedsy" class="brand-logo" />
			<h1>Object Detection</h1>
		</div>
		<div class="stats">
			<span class="stat-item">
				<i class="fas fa-location-crosshairs"></i>
				{location?.latitude && location?.longitude ? 'GPS OK' : 'Locating...'}
			</span>
			<span class="stat-item">
				<i class="fas fa-bullseye"></i>
				{latestDetections.length} detections
			</span>
			<button class="fit-bounds-btn" onclick={recenterMap} disabled={!location?.latitude}>
				<i class="fas fa-crosshairs"></i>
				<span class="btn-label">Center</span>
			</button>
			<button class="relocate-btn" class:active={relocateMode} onclick={() => (relocateMode = !relocateMode)}>
				<i class="fas fa-map-marker-alt"></i>
				<span class="btn-label">{relocateMode ? 'Tap map…' : 'Relocate'}</span>
			</button>
		</div>
	</div>

	<div class="content">
		<div class="video-card" class:none={videoSourceNone}>
			<ObjectDetection bind:this={objectDetectionComp} onDetection={sendDetectionData} on:sourcechange={(e) => (videoSourceNone = e.detail === 'none')} on:detectionclick={handleDetectionClick} />
		</div>

		<div class="map-container" bind:this={mapContainer}>
			{#if pageVisible && containerHasSize}
				<MapLibre
					bind:map
					style={mapStyle}
					center={center}
					zoom={zoom}
					class="map"
					on:load={() => map && map.resize()}
				>
				{#if relocateMode}
					<div class="relocate-hint">Click on the map to set your location</div>
				{/if}
				{#if location?.latitude && location?.longitude}
					<Marker
						lnglat={[location.longitude, location.latitude]}
						class="client-marker"
						content={cameraPin}
					>
						<div style="display:none"></div>
					</Marker>

						{#if Array.isArray(latestDetections) && latestDetections.length > 0}
							{#each latestDetections as det}
								{#if isVisibleDetection(det) && (typeof det.score !== 'number' || det.score >= minScore)}
									{#if (det.class || '').toLowerCase() === 'airplane'}
										<Marker lnglat={computeDestForDet(location.latitude, location.longitude, det, $config.camera, $config.objectSizes)} class="detection-marker" content={airplanePin}>
											<div style="display:none"></div>
											<Popup offset={[0, -10]} closeButton={false}>
												<div class="popup-content">
													<strong>{det.class}</strong> {(det.score * 100).toFixed(1)}%
												</div>
											</Popup>
										</Marker>
									{:else if (det.class || '').toLowerCase() === 'bird'}
										<Marker lnglat={computeDestForDet(location.latitude, location.longitude, det, $config.camera, $config.objectSizes)} class="detection-marker" content={birdPin}>
											<div style="display:none"></div>
											<Popup offset={[0, -10]} closeButton={false}>
												<div class="popup-content">
													<strong>{det.class}</strong> {(det.score * 100).toFixed(1)}%
												</div>
											</Popup>
										</Marker>
									{:else}
										<Marker lnglat={computeDestForDet(location.latitude, location.longitude, det, $config.camera, $config.objectSizes)} class="detection-marker" content={genericPin}>
											<div style="display:none"></div>
											<Popup offset={[0, -10]} closeButton={false}>
												<div class="popup-content">
													<strong>{det.class}</strong> {(det.score * 100).toFixed(1)}%
												</div>
											</Popup>
										</Marker>
									{/if}
								{/if}
							{/each}
						{/if}
				{/if}
				</MapLibre>
			{/if}
		</div>

		<div class="legend">
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
			<div class="legend-row">
				<label class="legend-label" for="minScore">Min score</label>
				<input id="minScore" type="range" min="0" max="1" step="0.05" bind:value={minScore} />
				<span>{minScore.toFixed(2)}</span>
			</div>
		</div>

		<div class="settings-card">
			<Settings />
		</div>
	</div>
</div>

{#if selectedDetection}
<div class="selection-toast">
	<span class="sel-label">{selectedDetection.class}</span>
	<span class="sel-score">{(selectedDetection.score * 100).toFixed(1)}%</span>
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

<style>
	.page {
		min-height: 100vh;
		display: flex;
		flex-direction: column;
		background: #f5f5f5;
	}

	.content {
		width: 100%;
		max-width: 1100px;
		margin: 0 auto;
	}

	.header {
		background: white;
		padding: 0.75rem 1rem;
		box-shadow: 0 2px 4px rgba(0,0,0,0.1);
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 0.5rem;
		position: sticky;
		top: 0;
		z-index: 100;
	}

	.brand {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.brand-logo {
		height: 28px;
		width: auto;
		display: block;
	}

	.header h1 {
		margin: 0;
		color: #333;
		font-size: 1.1rem;
	}

	.stats {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		overflow-x: auto;
		-webkit-overflow-scrolling: touch;
	}

	.stat-item {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		background: #e3f2fd;
		padding: 0.35rem 0.6rem;
		border-radius: 16px;
		font-weight: 500;
		color: #1565c0;
		font-size: 0.85rem;
	}

	.fit-bounds-btn, .relocate-btn {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.45rem 0.75rem; /* slightly smaller */
		color: white;
		border: none;
		border-radius: 16px;
		cursor: pointer;
		white-space: nowrap;
		font-size: 0.9rem;
		line-height: 1;
	}


    

	.fit-bounds-btn:disabled {
		background: #bdbdbd;
		cursor: not-allowed;
	}

	.fit-bounds-btn { background: #4caf50; }
	.relocate-btn { background: #9c27b0; }
	.relocate-btn i, .fit-bounds-btn i { color: #ffffff; }
	.relocate-btn.active { background: #7b1fa2; }

	/* Mobile adjustments */
	@media (max-width: 640px) {
		.header {
			flex-direction: column;
			align-items: stretch;
			gap: 0.5rem;
		}
		.brand-logo { height: 24px; }
		.header h1 { font-size: 1rem; }
		.stats { padding-bottom: 0.25rem; }
		.stats > * { flex: 0 0 auto; }
		.btn-label { display: none; }
	}

	@media (max-width: 400px) {
		.header h1 { display: none; }
		.stat-item { padding: 0.3rem 0.5rem; }
	}

	/* Slider styling (shared look) */
	input[type="range"] {
		appearance: none;
		width: 160px;
		height: 6px;
		border-radius: 999px;
		background: linear-gradient(90deg, #4caf50, #81c784);
		outline: none;
	}
	input[type="range"]::-webkit-slider-thumb {
		appearance: none;
		width: 20px;
		height: 20px;
		border-radius: 50%;
		background: #fff;
		border: 2px solid #4caf50;
		box-shadow: 0 1px 3px rgba(0,0,0,0.2);
	}
	input[type="range"]::-moz-range-thumb {
		width: 20px;
		height: 20px;
		border-radius: 50%;
		background: #fff;
		border: 2px solid #4caf50;
		box-shadow: 0 1px 3px rgba(0,0,0,0.2);
	}

	.video-card {
		background: transparent;
		padding: 0;
		margin: 0.75rem;
		border-radius: 0;
		box-shadow: none;
	}
	.settings-card {
		background: white;
		padding: 0.75rem;
		margin: 0.75rem;
		border-radius: 8px;
		box-shadow: 0 1px 2px rgba(0,0,0,0.08);
	}

	.video-card.none {
		padding-bottom: 0.25rem;
		margin-bottom: 0.25rem;
	}

	.map-container {
		flex: 1;
		height: 45vh;
		min-height: 260px;
		margin: 0 0.75rem 0.75rem 0.75rem;
		border-radius: 8px;
		overflow: hidden;
		position: relative;
		box-shadow: 0 1px 2px rgba(0,0,0,0.08);
	}

	:global(.map) {
		width: 100%;
		height: 100%;
	}

	.legend {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		background: white;
		border-radius: 8px;
		margin: 0 0.75rem 0.75rem 0.75rem;
		padding: 0.5rem 0.75rem;
		box-shadow: 0 1px 2px rgba(0,0,0,0.08);
		flex-wrap: wrap;
	}

	.legend-row {
		display: flex;
		align-items: center;
		gap: 0.4rem;
	}

	.legend-icon.bird { color: #43a047; }
	.legend-icon.airplane { color: #1565c0; }

	/* Match /gather pin styles exactly */
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
	}
	:global(.detection-pin i) {
		color: #fff;
		font-size: 10px;
	}
	:global(.detection-pin.airplane) { background: #1976d2; }
	:global(.detection-pin.bird) { background: #43a047; }

	.relocate-hint {
		position: absolute;
		top: 8px;
		left: 50%;
		transform: translateX(-50%);
		z-index: 10;
		background: rgba(255,255,255,0.95);
		color: #333;
		padding: 6px 10px;
		border-radius: 6px;
		box-shadow: 0 2px 6px rgba(0,0,0,0.15);
		font-size: 12px;
	}

	.selection-toast {
		position: fixed;
		bottom: 12px;
		right: 12px;
		background: #000a;
		backdrop-filter: blur(3px);
		color: #fff;
		border-radius: 10px;
		padding: 8px 10px;
		display: inline-flex;
		align-items: center;
		gap: 8px;
		box-shadow: 0 4px 12px rgba(0,0,0,0.25);
		z-index: 2000;
	}
	.selection-toast .sel-label { font-weight: 600; }
	.selection-toast .sel-score { opacity: 0.9; font-variant-numeric: tabular-nums; }

	.token-overlay {
		position: fixed;
		inset: 0;
		background: rgba(0,0,0,0.4);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 9999;
	}
	.token-card { background: #fff; padding: 16px; border-radius: 8px; width: 320px; box-shadow: 0 8px 24px rgba(0,0,0,0.2); }
	.token-card h3 { margin: 0 0 8px; display: flex; align-items: center; gap: 8px; }
	.token-card .error { color: #b00020; margin-bottom: 8px; font-size: 0.9rem; }
	.token-card label { display: grid; gap: 6px; font-size: 0.9rem; }
	.token-card input { padding: 8px; border: 1px solid #ddd; border-radius: 6px; }
	.token-card .actions { display: flex; justify-content: flex-end; margin-top: 12px; }
	.token-card .primary { background: #2d7; border: none; padding: 8px 12px; border-radius: 6px; cursor: pointer; }
</style>