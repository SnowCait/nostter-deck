<script lang="ts">
	import { onMount } from 'svelte';
	import { getLocale } from '$lib/paraglide/runtime.js';
	import './layout.css';

	const { children } = $props();

	onMount(() => {
		document.documentElement.lang = getLocale();
	});
</script>

{@render children()}
