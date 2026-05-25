<script lang="ts">
	import { Globe, Radio, Search, UsersRound } from '@lucide/svelte';
	import type { Column } from '$lib/deck/types';

	type Props = {
		column: Column;
		iconClass: string;
	};

	const { column, iconClass }: Props = $props();
</script>

{#if column.type === 'website'}
	<Globe class={iconClass} aria-hidden="true" />
{:else if column.timelineKind === 'custom'}
	<Radio class={iconClass} aria-hidden="true" />
{:else if column.sourceKey === 'timeline_follow'}
	<UsersRound class={iconClass} aria-hidden="true" />
{:else}
	<Search class={iconClass} aria-hidden="true" />
{/if}
