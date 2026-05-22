<script lang="ts">
	import {
		ArrowLeft,
		ArrowRight,
		Bell,
		House,
		List,
		Search,
		SlidersHorizontal,
		Trash2
	} from '@lucide/svelte';
	import { m } from '$lib/paraglide/messages.js';
	import type { Column } from '$lib/deck/types';
	import PostCard from './PostCard.svelte';

	type Props = {
		column: Column;
		id: string;
		isFocused: boolean;
		isSettingsOpen: boolean;
		canMoveLeft: boolean;
		canMoveRight: boolean;
		onToggleSettings: () => void;
		onDelete: () => void;
		onMoveLeft: () => void;
		onMoveRight: () => void;
	};

	const {
		column,
		id,
		isFocused,
		isSettingsOpen,
		canMoveLeft,
		canMoveRight,
		onToggleSettings,
		onDelete,
		onMoveLeft,
		onMoveRight
	}: Props = $props();

	const columnIconClass = 'size-4 shrink-0 text-slate-500';
	const columnActionClass =
		'flex size-8 shrink-0 items-center justify-center rounded-md text-slate-500 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent';
	const settingsActionClass =
		'flex h-9 min-w-0 items-center justify-center gap-2 rounded-md border border-slate-200 px-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent';
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
				{#if column.sourceKey === 'timeline_home'}
					<House class={columnIconClass} aria-hidden="true" />
				{:else if column.sourceKey === 'timeline_mentions'}
					<Bell class={columnIconClass} aria-hidden="true" />
				{:else if column.sourceKey === 'timeline_search'}
					<Search class={columnIconClass} aria-hidden="true" />
				{:else}
					<List class={columnIconClass} aria-hidden="true" />
				{/if}
				<h2 class="min-w-0 truncate text-base font-bold">
					{m[column.sourceKey]()}
				</h2>
			</div>
			<div class="flex shrink-0 items-center gap-1">
				<button
					type="button"
					class={columnActionClass}
					title={m.column_options()}
					aria-label={m.column_options()}
					aria-expanded={isSettingsOpen}
					onclick={onToggleSettings}
				>
					<SlidersHorizontal class="size-4" aria-hidden="true" />
				</button>
			</div>
		</div>
	</header>

	{#if isSettingsOpen}
		<div class="shrink-0 border-b border-slate-200 bg-slate-50 px-3 py-3">
			<div class="grid grid-cols-2 gap-2">
				<button
					type="button"
					class={settingsActionClass}
					title={m.move_column_left()}
					aria-label={m.move_column_left()}
					disabled={!canMoveLeft}
					onclick={onMoveLeft}
				>
					<ArrowLeft class="size-4 shrink-0" aria-hidden="true" />
					<span class="truncate">{m.move_column_left()}</span>
				</button>
				<button
					type="button"
					class={settingsActionClass}
					title={m.move_column_right()}
					aria-label={m.move_column_right()}
					disabled={!canMoveRight}
					onclick={onMoveRight}
				>
					<ArrowRight class="size-4 shrink-0" aria-hidden="true" />
					<span class="truncate">{m.move_column_right()}</span>
				</button>
			</div>
			<button
				type="button"
				class="mt-2 flex h-9 w-full items-center justify-center gap-2 rounded-md px-3 text-sm font-semibold text-rose-600 transition hover:bg-rose-50"
				onclick={onDelete}
			>
				<Trash2 class="size-4 shrink-0" aria-hidden="true" />
				<span>{m.delete_column()}</span>
			</button>
		</div>
	{/if}

	<div class="min-h-0 flex-1 overflow-y-auto">
		{#each column.posts as post (`${column.id}-${post.author}-${post.time}`)}
			<PostCard {post} />
		{/each}
	</div>
</section>
