<script lang="ts">
	import { Bell, Globe, House, List, Radio, Search, UsersRound } from '@lucide/svelte';
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
{:else if column.sourceKey === 'timeline_home'}
	<House class={iconClass} aria-hidden="true" />
{:else if column.sourceKey === 'timeline_mentions'}
	<Bell class={iconClass} aria-hidden="true" />
{:else if column.sourceKey === 'timeline_follow'}
	<UsersRound class={iconClass} aria-hidden="true" />
{:else if column.sourceKey === 'timeline_search'}
	<Search class={iconClass} aria-hidden="true" />
{:else}
	<List class={iconClass} aria-hidden="true" />
{/if}
