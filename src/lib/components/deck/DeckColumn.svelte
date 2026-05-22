<script lang="ts">
	import { Bell, House, List, Search, SlidersHorizontal } from '@lucide/svelte';
	import { m } from '$lib/paraglide/messages.js';
	import type { Column } from '$lib/deck/types';
	import PostCard from './PostCard.svelte';

	type Props = {
		column: Column;
		id: string;
		isFocused: boolean;
	};

	const { column, id, isFocused }: Props = $props();

	const columnIconClass = 'size-4 shrink-0 text-slate-500';
</script>

<section
	{id}
	tabindex="-1"
	class={[
		'flex h-full w-[342px] flex-col overflow-hidden border-r border-slate-200 bg-white transition-shadow outline-none',
		isFocused ? 'relative z-10 shadow-[inset_0_0_0_2px_rgba(14,165,233,0.45)]' : ''
	]}
>
	<header class="shrink-0 border-b border-slate-200 bg-white px-3 py-2.5">
		<div class="flex items-center justify-between gap-3">
			<div class="flex min-w-0 items-center gap-2">
				{#if column.titleKey === 'timeline_home'}
					<House class={columnIconClass} aria-hidden="true" />
				{:else if column.titleKey === 'timeline_mentions'}
					<Bell class={columnIconClass} aria-hidden="true" />
				{:else if column.titleKey === 'timeline_search'}
					<Search class={columnIconClass} aria-hidden="true" />
				{:else}
					<List class={columnIconClass} aria-hidden="true" />
				{/if}
				<h2 class="min-w-0 truncate text-base font-bold">
					{m[column.titleKey]()}
				</h2>
			</div>
			<button
				type="button"
				class="flex size-8 shrink-0 items-center justify-center rounded-md text-slate-500 transition hover:bg-slate-100"
				title={m.column_options()}
				aria-label={m.column_options()}
			>
				<SlidersHorizontal class="size-4" aria-hidden="true" />
			</button>
		</div>
	</header>

	<div class="min-h-0 flex-1 overflow-y-auto">
		{#each column.posts as post (`${column.titleKey}-${post.author}-${post.time}`)}
			<PostCard {post} />
		{/each}
	</div>
</section>
