<script lang="ts">
	import { onMount } from 'svelte';
	import { getLocale } from '$lib/paraglide/runtime.js';
	import { applyThemePreference, watchSystemThemePreference } from '$lib/user-settings';
	import './layout.css';

	const { children } = $props();

	onMount(() => {
		document.documentElement.lang = getLocale();
		applyThemePreference();

		return watchSystemThemePreference();
	});
</script>

{@render children()}
