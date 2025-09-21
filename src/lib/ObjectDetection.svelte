<script>
			import "./tf-wasm-setup.js";
			import * as tf from "@tensorflow/tfjs";
			import "@tensorflow/tfjs-backend-webgl";
			import "@tensorflow/tfjs-backend-wasm";
	import { detectVideo } from "./adapter/yolov8/detect";
  import { Webcam } from "./adapter/yolov8/webcam";
  import { config } from "./config";
	import { createEventDispatcher } from 'svelte';
	// Prefer using the official API to point to WASM binaries
	import { setWasmPaths } from '@tensorflow/tfjs-backend-wasm';

	// Props
	let { onDetection = () => {} } = $props();
  const dispatch = createEventDispatcher();

	let camera = $state();
	let canvas = $state();
	let latestDetections = $state([]);

	let model = $state({});

	let useMask = false;
	let videoSource = $state('none'); // 'none', 'camera', 'upload'

	const webcam = new Webcam();

	// Function to switch video source
	const switchToCamera = async () => {
		if (videoSource !== 'camera') {
			// Stop any existing video
			stopCurrentVideo();
			videoSource = 'camera';
			try {
				await webcam.open(camera);
			} catch (error) {
				console.error('Failed to open camera:', error);
				alert('Failed to access camera. Please ensure camera permissions are granted.');
				videoSource = 'none';
			}
			dispatch('sourcechange', videoSource);
		}
	};

	const switchToUpload = () => {
		if (videoSource !== 'upload') {
			stopCurrentVideo();
			videoSource = 'upload';
			dispatch('sourcechange', videoSource);
		}
	};

	const switchToNone = () => {
		stopCurrentVideo();
		videoSource = 'none';
		dispatch('sourcechange', videoSource);
	};

	const stopCurrentVideo = () => {
		if (videoSource === 'camera') {
			webcam.close(camera);
		} else if (camera) {
			camera.pause();
			camera.loop = false;
			if (camera.src) {
				// Revoke object URL to prevent memory leaks
				if (camera.src.startsWith('blob:')) {
					URL.revokeObjectURL(camera.src);
				}
				camera.src = '';
			}
			if (camera.srcObject) {
				camera.srcObject = null;
			}
		}
	};

	const handleFileUpload = (e) => {
			const target = e.target;
		if (target && target.files) {
			const file = target.files[0];
			if (!file) return;
			stopCurrentVideo();
			const url = URL.createObjectURL(file);
				camera.src = url;
				camera.muted = true;
				camera.autoplay = true;
				// Ensure playback starts once metadata is loaded
				const onLoaded = () => {
					camera.play().catch(() => {});
					camera.removeEventListener('loadedmetadata', onLoaded);
				};
				camera.addEventListener('loadedmetadata', onLoaded);
				// Ensure uploaded videos loop instead of freezing at the end
				camera.loop = true;
				camera.addEventListener('ended', () => {
					if (videoSource === 'upload') {
						camera.currentTime = 0;
						camera.play().catch(() => {});
					}
				});
			videoSource = 'upload';
			dispatch('sourcechange', videoSource);
		}
	}; 

		$effect.root(() => {
					tf.ready().then(async () => {
						// Prefer WebGL (usually fastest). Fallback to WASM if WebGL fails/unavailable.
						let ok = false;
						try { await tf.setBackend('webgl'); ok = (tf.getBackend() === 'webgl'); } catch {}
						if (!ok) {
							try { await tf.setBackend('wasm'); } catch {}
						}
			const yolov8 = await tf.loadGraphModel("/models/yolov8/model.json", {})
		
			const warmupInput = tf.randomUniform(yolov8.inputs[0].shape, 0, 1, "float32")
			const warmupOutput = yolov8.execute(warmupInput)
			model = {
				net: yolov8,
				inputShape: yolov8.inputs[0].shape,
				outputShape: warmupOutput.map((e) => e.shape)
			}

			tf.dispose([warmupOutput, warmupInput])
		      console.log("Model initialized...")
		})
	})

	// Cleanup effect
	$effect(() => {
		return () => {
			stopCurrentVideo();
		};
	});
	// Receive detections on every frame via provided callback
	function handleFrameDetections(dets) {
		latestDetections = Array.isArray(dets) ? dets : [];
		// bubble up to consumer (existing API)
		try { onDetection(latestDetections); } catch {}
	}

	// Helper: crop clicked detection from current video frame
	function cropDetectionFromVideo(det) {
		if (!camera || !det || !Array.isArray(det.box)) return null;
		const basis = Array.isArray(det.frameBox) && det.frameBox.length === 4 ? det.frameBox : det.box;
		const [y, x, h, w] = basis.map((v) => Math.max(0, Math.floor(v)));

		const vw = camera.videoWidth || 0;
		const vh = camera.videoHeight || 0;
		if (!vw || !vh) return null;

		// Draw current frame with the same pad+resize as preprocess
		const TARGET_W = (canvas && canvas.width) ? canvas.width : 640;
		const TARGET_H = (canvas && canvas.height) ? canvas.height : 640;
		const maxSize = Math.max(vw, vh);
		// 1) pad to a square of size maxSize with content at top-left
		const padCanvas = document.createElement('canvas');
		padCanvas.width = maxSize;
		padCanvas.height = maxSize;
		const padCtx = padCanvas.getContext('2d');
		padCtx.fillStyle = '#000';
		padCtx.fillRect(0, 0, maxSize, maxSize);
		padCtx.drawImage(camera, 0, 0, vw, vh);
		// 2) resize that square to model space (TARGET_W x TARGET_H)
		const prep = document.createElement('canvas');
		prep.width = TARGET_W;
		prep.height = TARGET_H;
		const pr = prep.getContext('2d');
		pr.imageSmoothingEnabled = true;
		pr.drawImage(padCanvas, 0, 0, maxSize, maxSize, 0, 0, TARGET_W, TARGET_H);

		// Clamp the detection box to this space, with a bit of padding to capture slightly more
		const PAD = 6; // a few pixels of padding around the box
		const bx = Math.max(0, Math.min(x - PAD, TARGET_W - 1));
		const by = Math.max(0, Math.min(y - PAD, TARGET_H - 1));
		const bw = Math.max(1, Math.min(w + PAD * 2, TARGET_W - bx));
		const bh = Math.max(1, Math.min(h + PAD * 2, TARGET_H - by));

		// Extract crop from the preprocessed frame
		const cropCanvas = document.createElement('canvas');
		cropCanvas.width = bw;
		cropCanvas.height = bh;
		const cctx = cropCanvas.getContext('2d');
		cctx.drawImage(prep, bx, by, bw, bh, 0, 0, bw, bh);

		// Resize to a reasonable thumbnail size
		const MAX_DIM = 256;
		const scale = Math.min(1, MAX_DIM / Math.max(bw, bh));
		const outW = Math.max(1, Math.round(bw * scale));
		const outH = Math.max(1, Math.round(bh * scale));
		const outCanvas = document.createElement('canvas');
		outCanvas.width = outW;
		outCanvas.height = outH;
		const octx = outCanvas.getContext('2d');
		octx.drawImage(cropCanvas, 0, 0, bw, bh, 0, 0, outW, outH);

		try {
			return outCanvas.toDataURL('image/jpeg', 0.85);
		} catch {
			return outCanvas.toDataURL();
		}
	}

	// Handle canvas click to find a detection and dispatch details
	function handleCanvasClick(ev) {
		if (!canvas || !latestDetections || latestDetections.length === 0) return;
		const rect = canvas.getBoundingClientRect();
		const scaleX = canvas.width / rect.width;
		const scaleY = canvas.height / rect.height;
		const x = (ev.clientX - rect.left) * scaleX;
		const y = (ev.clientY - rect.top) * scaleY;

		// iterate from last to first so the newest/upper drawn gets priority
		for (let i = latestDetections.length - 1; i >= 0; i--) {
			const d = latestDetections[i];
			const [dy, dx, dh, dw] = d.box || [];
			if (typeof dx === 'number' && typeof dy === 'number' && typeof dw === 'number' && typeof dh === 'number') {
				if (x >= dx && x <= dx + dw && y >= dy && y <= dy + dh) {
					const image = cropDetectionFromVideo(d);
					dispatch('detectionclick', { detection: d, image });
					break;
				}
			}
		}
	}

	// Public API: allow parent to request a crop for a detection
	export function crop(det) {
		return cropDetectionFromVideo(det);
	}
</script>

<div class="object-detection-container">
	<!-- Video Source Selection -->
	<div class="source-controls">
		<h3>Video Source</h3>
		<div class="source-buttons">
			<button 
				class="source-btn {videoSource === 'camera' ? 'active' : ''}" 
				onclick={switchToCamera}
			>
				<i class="fa-solid fa-camera"></i>&nbsp;Camera
			</button>
			<button 
				class="source-btn {videoSource === 'upload' ? 'active' : ''}" 
				onclick={switchToUpload}
			>
				<i class="fa-solid fa-file-arrow-up"></i>&nbsp;Upload
			</button>
			<button 
				class="source-btn {videoSource === 'none' ? 'active' : ''}" 
				onclick={switchToNone}
			>
				<i class="fa-solid fa-ban"></i>&nbsp;None
			</button>
		</div>

		<!-- File upload -->
		{#if videoSource === 'upload'}
			<div class="upload-section">
				<input type="file" accept="video/*" onchange={handleFileUpload} />
			</div>
		{/if}
	</div>

	<!-- Detection Controls (mask disabled) -->

	<!-- Video Display -->
	{#if videoSource !== 'none'}
		<div class="video-container">
			<div class="relative">
				<video 
					class="w-full h-full" 
					autoplay 
					muted 
					playsinline
					loop={videoSource === 'upload'}
					bind:this={camera} 
					onplay={() => detectVideo(camera, model, canvas, useMask, handleFrameDetections)} 
					oncancel={() => console.log("cancel")}
				></video>
				<canvas 
					class="absolute top-0 left-0 w-full h-full" 
					width={$config.canvas.width} 
					height={$config.canvas.height} 
					bind:this={canvas}
					onclick={handleCanvasClick}
				></canvas>
			</div>
		</div>
	{/if}
</div>

<style>
	.object-detection-container {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.source-controls {
		background: #fff;
		padding: 0.75rem;
		border-radius: 12px;
		border: 1px solid #e6e6e6;
		box-shadow: 0 1px 2px rgba(0,0,0,0.04);
	}

	.source-controls h3 {
		margin: 0 0 1rem 0;
		font-size: 1.1rem;
		font-weight: 600;
	}

	.source-buttons {
		display: inline-flex;
		gap: 0;
		flex-wrap: nowrap;
		border: 1px solid #ddd;
		border-radius: 10px;
		overflow: hidden;
		background: #f8f9fa;
	}

	.source-btn {
		padding: 0.5rem 0.9rem;
		border: none;
		background: transparent;
		cursor: pointer;
		transition: all 0.2s ease;
		font-size: 0.9rem;
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
	}

	.source-btn:hover {
		background: #eef2f6;
	}

	.source-btn.active {
		background: #007acc;
		color: white;
	}

	.upload-section {
		margin-top: 0.75rem;
		padding: 0.75rem;
		background: #fff;
		border-radius: 8px;
		border: 1px solid #e6e6e6;
	}

	@media (max-width: 480px) {
		.source-buttons { width: 100%; }
		.source-btn { flex: 1; justify-content: center; }
	}

	/* mask controls removed */

	.video-container {
		flex: 1;
	}

	.relative {
		position: relative;
	}

	.absolute {
		position: absolute;
	}

	.top-0 {
		top: 0;
	}

	.left-0 {
		left: 0;
	}

	.w-full {
		width: 100%;
	}

	.h-full {
		height: 100%;
	}

	/* removed unused bg classes */
</style>