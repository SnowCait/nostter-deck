<script lang="ts">
	import { Globe, MessagesSquare, Radio, Search, UsersRound } from '@lucide/svelte';
	import type { ColumnIconKey } from '$lib/deck/types';

	type Props = {
		iconKey: ColumnIconKey;
		iconClass: string;
	};

	const { iconKey, iconClass }: Props = $props();
</script>

{#if iconKey === 'globe'}
	<Globe class={iconClass} aria-hidden="true" />
{:else if iconKey === 'radio'}
	<Radio class={iconClass} aria-hidden="true" />
{:else if iconKey === 'users'}
	<UsersRound class={iconClass} aria-hidden="true" />
{:else if iconKey === 'messages'}
	<MessagesSquare class={iconClass} aria-hidden="true" />
{:else}
	<Search class={iconClass} aria-hidden="true" />
{/if}
