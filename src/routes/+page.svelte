<svelte:head>
	<title>Home</title>
</svelte:head>

<div class="page">
	<div class="header">
		<div class="brand">
			<img src="/jedsy-logo-main.png" alt="Jedsy" class="brand-logo" />
			<h1>Home</h1>
		</div>
	</div>

	<div class="content">
		<section class="hero">
			<h2>Minimal, fast object detection</h2>
			<p>Run on-device detection and monitor sightings live on a shared map.</p>
		</section>

		<section class="actions">
			<a href="/detect" class="action-card">
				<div class="icon detect"><i class="fas fa-bullseye"></i></div>
				<div class="text">
					<h3>Detect</h3>
					<p>Start detecting birds and aircraft using your camera.</p>
				</div>
				<div class="cta"><span>Open</span><i class="fas fa-arrow-right"></i></div>
			</a>

			<a href="/gather" class="action-card">
				<div class="icon map"><i class="fas fa-map"></i></div>
				<div class="text">
					<h3>Gather</h3>
					<p>View all active clients and their latest detections.</p>
				</div>
				<div class="cta"><span>Open</span><i class="fas fa-arrow-right"></i></div>
			</a>
		</section>

		<footer class="meta">
			<span>Built with</span>
			<a href="https://kit.svelte.dev/" target="_blank" rel="noreferrer">SvelteKit</a>
			<span>and</span>
			<a href="https://www.tensorflow.org/js" target="_blank" rel="noreferrer">TensorFlow.js</a>
		</footer>
	</div>
</div>

<style>
	.page {
		min-height: 100vh;
		display: flex;
		flex-direction: column;
		background: #f5f5f5;
	}

	.header {
		background: white;
		padding: 1rem 1.25rem;
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
		font-size: 1.25rem;
	}

	.content {
		width: 100%;
		max-width: 1100px;
		margin: 0 auto;
		padding: 1rem;
	}

	.hero {
		padding: 1rem;
		margin: 0.75rem;
		background: white;
		border-radius: 8px;
		box-shadow: 0 1px 2px rgba(0,0,0,0.08);
	}
	.hero h2 {
		margin: 0 0 0.25rem 0;
		color: #333;
		font-size: 1.35rem;
	}
	.hero p { margin: 0; color: #666; }

	.actions {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.75rem;
		margin: 0.75rem;
	}

	.action-card {
		display: grid;
		grid-template-columns: auto 1fr auto;
		align-items: center;
		gap: 0.75rem;
		text-decoration: none;
		background: white;
		border-radius: 8px;
		padding: 0.9rem 1rem;
		box-shadow: 0 1px 2px rgba(0,0,0,0.08);
		transition: transform .15s ease, box-shadow .15s ease;
		color: inherit;
	}
	.action-card:hover { transform: translateY(-2px); box-shadow: 0 4px 12px rgba(0,0,0,0.12); }

	.icon {
		width: 36px; height: 36px;
		border-radius: 8px;
		display: inline-flex; align-items: center; justify-content: center;
		color: #fff;
	}
	.icon.detect { background: #4caf50; }
	.icon.map { background: #1565c0; }
	.icon i { font-size: 16px; }

	.text h3 { margin: 0; color: #333; font-size: 1.05rem; }
	.text p { margin: 2px 0 0 0; color: #666; font-size: 0.9rem; }

	.cta { display: inline-flex; align-items: center; gap: 6px; color: #1565c0; font-weight: 600; }
	.cta i { color: #1565c0; }

	.meta {
		margin: 0.75rem;
		padding: 0.5rem 0.75rem;
		color: #666;
		font-size: 0.9rem;
	}
	.meta a { color: #1565c0; text-decoration: none; }
	.meta a:hover { text-decoration: underline; }

	@media (max-width: 720px) {
		.actions { grid-template-columns: 1fr; }
	}
</style>
