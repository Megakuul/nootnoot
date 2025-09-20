<h1>Welcome to NootNoot</h1>
<p>Your AI-powered object detection app!</p>

<div class="features">
	<a href="/detect" class="feature-card">
		<h2>🔍 Object Detection</h2>
		<p>Detect moving objects with AI using your webcam</p>
	</a>
</div>

<p>Built with <a href="https://svelte.dev/docs/kit">SvelteKit</a> and <a href="https://www.tensorflow.org/js">TensorFlow.js</a></p>

<style>
	.features {
		margin: 2rem 0;
		display: flex;
		gap: 1rem;
	}
	
	.feature-card {
		display: block;
		padding: 1.5rem;
		background: #f8f9fa;
		border: 2px solid #e9ecef;
		border-radius: 8px;
		text-decoration: none;
		color: inherit;
		transition: all 0.2s;
	}
	
	.feature-card:hover {
		border-color: #007bff;
		transform: translateY(-2px);
		box-shadow: 0 4px 8px rgba(0,0,0,0.1);
	}
	
	.feature-card h2 {
		margin: 0 0 0.5rem 0;
		color: #007bff;
	}
	
	.feature-card p {
		margin: 0;
		color: #6c757d;
	}
</style>
