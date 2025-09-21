<script>
	import '../app.css';
	
	let { children } = $props();
</script>

<svelte:head>
	<link rel="shortcut icon" href="//jedsy.com/cdn/shop/files/Favicon_32x32.png?v=1633920258" type="image/png" />
	<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css" crossorigin="anonymous" referrerpolicy="no-referrer" />
</svelte:head>

{@render children?.()}
