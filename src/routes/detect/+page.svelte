<script>
	import ObjectDetection from '$lib/ObjectDetection.svelte';
	import Map from '$lib/Map.svelte';
</script>

<svelte:head>
	<title>Object Detection - NootNoot</title>
</svelte:head>

<div class="page">
	<ObjectDetection />
	<Map />
</div>

<style>
	.page {
		max-width: 800px;
		margin: 0 auto;
		padding: 2rem;
	}
	
	.info {
		margin-top: 2rem;
		padding: 1rem;
		background: #f8f9fa;
		border-radius: 8px;
	}
	
	.info ul {
		margin: 1rem 0;
	}
	
	.info li {
		margin: 0.5rem 0;
	}
	
	.note {
		margin-top: 1rem;
		padding: 1rem;
		background: #fff3cd;
		border: 1px solid #ffeaa7;
		border-radius: 4px;
		color: #856404;
	}
</style>