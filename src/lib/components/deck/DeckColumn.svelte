<script lang="ts">
	import {
		ArrowLeft,
		ArrowRight,
		Bell,
		Globe,
		House,
		List,
		Search,
		SlidersHorizontal,
		Trash2
	} from '@lucide/svelte';
	import { m } from '$lib/paraglide/messages.js';
	import { getColumnTitle } from '$lib/deck/column-title';
	import { columnWidths } from '$lib/deck/column-configs';
	import type { Column, ColumnWidth, NostrFilter, RelaySelection } from '$lib/deck/types';
	import type { FontSizeTextClasses } from '$lib/font-size';
	import type { AvatarShape } from '$lib/user-settings';
	import { parseNostrFilters } from '$lib/nostr/filters';
	import {
		defaultRelays,
		formatCustomRelays,
		getSelectedDefaultRelays,
		resolveRelayDraft,
		resolveRelaySelection
	} from '$lib/nostr/relays';
	import PostCard from './PostCard.svelte';

	type Props = {
		column: Column;
		id: string;
		isFocused: boolean;
		isSettingsOpen: boolean;
		canMoveLeft: boolean;
		canMoveRight: boolean;
		textClass: FontSizeTextClasses;
		avatarShape: AvatarShape;
		onToggleSettings: () => void;
		onDelete: () => void;
		onMoveLeft: () => void;
		onMoveRight: () => void;
		onWidthChange: (width: ColumnWidth) => void;
		onCustomTimelineSave: (filters: NostrFilter[], relays: RelaySelection) => void;
	};

	const {
		column,
		id,
		isFocused,
		isSettingsOpen,
		canMoveLeft,
		canMoveRight,
		textClass,
		avatarShape,
		onToggleSettings,
		onDelete,
		onMoveLeft,
		onMoveRight,
		onWidthChange,
		onCustomTimelineSave
	}: Props = $props();

	let filterDraftColumnId = $state('');
	let filterDraftSource = $state('');
	let filterDraft = $state('');
	let relayDraftSource = $state('');
	let selectedDefaultRelays = $state<string[]>([]);
	let customRelayDraft = $state('');

	const columnWidthClassByWidth = {
		narrow: 'w-[280px]',
		standard: 'w-[342px]',
		wide: 'w-[480px]'
	} satisfies Record<ColumnWidth, string>;

	const columnWidthLabels = {
		narrow: () => m.column_width_narrow(),
		standard: () => m.column_width_standard(),
		wide: () => m.column_width_wide()
	} satisfies Record<ColumnWidth, () => string>;

	const columnIconClass = 'size-4 shrink-0 text-slate-500 dark:text-slate-400';
	const columnActionClass =
		'flex size-8 shrink-0 items-center justify-center rounded-md text-slate-500 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100';
	const settingsActionClass =
		'flex h-9 min-w-0 items-center justify-center gap-2 rounded-md border border-slate-200 px-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 disabled:dark:hover:bg-transparent';
	const parsedFilterDraft = $derived(parseNostrFilters(filterDraft));
	const selectedDefaultRelaySet = $derived(new Set(selectedDefaultRelays));
	const parsedRelayDraft = $derived(resolveRelayDraft(selectedDefaultRelays, customRelayDraft));
	const canSaveCustomTimelineDraft = $derived(
		parsedFilterDraft !== null && parsedRelayDraft !== null
	);

	$effect(() => {
		if (column.type !== 'timeline' || column.timelineKind !== 'custom') return;

		const nextFilterDraft = JSON.stringify(column.filters, null, 2);
		const resolvedRelays = resolveRelaySelection(column.relays);
		const nextRelayDraft = JSON.stringify(column.relays);
		if (
			filterDraftColumnId === column.id &&
			filterDraftSource === nextFilterDraft &&
			relayDraftSource === nextRelayDraft
		) {
			return;
		}

		filterDraftColumnId = column.id;
		filterDraftSource = nextFilterDraft;
		relayDraftSource = nextRelayDraft;
		filterDraft = nextFilterDraft;
		selectedDefaultRelays = getSelectedDefaultRelays(resolvedRelays);
		customRelayDraft = formatCustomRelays(resolvedRelays);
	});

	function selectColumnWidth(event: Event) {
		onWidthChange((event.currentTarget as HTMLSelectElement).value as ColumnWidth);
	}

	function toggleDefaultRelay(relay: string, isSelected: boolean) {
		selectedDefaultRelays = isSelected
			? [...selectedDefaultRelaySet, relay]
			: selectedDefaultRelays.filter((selectedRelay) => selectedRelay !== relay);
	}

	function saveCustomTimelineDraft() {
		if (!parsedFilterDraft || !parsedRelayDraft) return;

		onCustomTimelineSave(parsedFilterDraft, parsedRelayDraft);
	}
</script>

<section
	{id}
	tabindex="-1"
	class={[
		'flex h-full flex-col overflow-hidden border-r border-slate-200 bg-white transition-[width,box-shadow] outline-none dark:border-slate-800 dark:bg-slate-950',
		columnWidthClassByWidth[column.width],
		isFocused ? 'relative z-10 shadow-[inset_0_0_0_2px_rgba(14,165,233,0.45)]' : ''
	]}
>
	<header
		class="shrink-0 border-b border-slate-200 bg-white px-3 py-2.5 dark:border-slate-800 dark:bg-slate-950"
	>
		<div class="flex items-center justify-between gap-3">
			<div class="flex min-w-0 items-center gap-2">
				{#if column.type === 'website'}
					<Globe class={columnIconClass} aria-hidden="true" />
				{:else if column.timelineKind === 'custom'}
					<List class={columnIconClass} aria-hidden="true" />
				{:else if column.sourceKey === 'timeline_home'}
					<House class={columnIconClass} aria-hidden="true" />
				{:else if column.sourceKey === 'timeline_mentions'}
					<Bell class={columnIconClass} aria-hidden="true" />
				{:else if column.sourceKey === 'timeline_search'}
					<Search class={columnIconClass} aria-hidden="true" />
				{:else}
					<List class={columnIconClass} aria-hidden="true" />
				{/if}
				<h2 class={['min-w-0 truncate font-bold', textClass.title]}>
					{getColumnTitle(column)}
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
		<div
			class="shrink-0 border-b border-slate-200 bg-slate-50 px-3 py-3 dark:border-slate-800 dark:bg-slate-900/70"
		>
			{#if column.type === 'timeline' && column.timelineKind === 'custom'}
				<label
					class={['mb-2 block font-semibold text-slate-700 dark:text-slate-300', textClass.control]}
					for={`column-filters-${column.id}`}
				>
					{m.custom_timeline_filters()}
				</label>
				<textarea
					id={`column-filters-${column.id}`}
					class={[
						'mb-3 min-h-32 w-full resize-y rounded-md border border-slate-300 bg-white px-3 py-2 font-mono text-slate-950 transition outline-none placeholder:text-slate-400 focus:border-sky-500 focus:ring-2 focus:ring-sky-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50 dark:placeholder:text-slate-500 dark:focus:border-sky-400 dark:focus:ring-sky-950',
						textClass.control
					]}
					bind:value={filterDraft}
				></textarea>

				<p class={['mb-2 font-semibold text-slate-700 dark:text-slate-300', textClass.control]}>
					{m.custom_timeline_relays()}
				</p>
				<div class="mb-3 grid gap-2">
					{#each defaultRelays as relay (relay)}
						<label
							class={[
								'flex min-w-0 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300',
								textClass.control
							]}
						>
							<input
								class="size-4 shrink-0 accent-sky-500"
								type="checkbox"
								checked={selectedDefaultRelaySet.has(relay)}
								onchange={(event) =>
									toggleDefaultRelay(relay, (event.currentTarget as HTMLInputElement).checked)}
							/>
							<span class="min-w-0 truncate">{relay}</span>
						</label>
					{/each}
				</div>

				<label
					class={['mb-2 block font-semibold text-slate-700 dark:text-slate-300', textClass.control]}
					for={`column-custom-relays-${column.id}`}
				>
					{m.custom_timeline_custom_relays()}
				</label>
				<textarea
					id={`column-custom-relays-${column.id}`}
					class={[
						'mb-3 min-h-24 w-full resize-y rounded-md border border-slate-300 bg-white px-3 py-2 font-mono text-slate-950 transition outline-none placeholder:text-slate-400 focus:border-sky-500 focus:ring-2 focus:ring-sky-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50 dark:placeholder:text-slate-500 dark:focus:border-sky-400 dark:focus:ring-sky-950',
						textClass.control
					]}
					bind:value={customRelayDraft}
				></textarea>
				<button
					type="button"
					class={[
						'mb-3 flex h-9 w-full items-center justify-center rounded-md bg-sky-500 px-3 font-semibold text-white transition hover:bg-sky-600 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500 dark:bg-sky-400 dark:text-slate-950 dark:hover:bg-sky-300 disabled:dark:bg-slate-800 disabled:dark:text-slate-500',
						textClass.control
					]}
					disabled={!canSaveCustomTimelineDraft}
					onclick={saveCustomTimelineDraft}
				>
					{m.save()}
				</button>
			{/if}

			<label
				class={['mb-2 block font-semibold text-slate-700 dark:text-slate-300', textClass.control]}
				for={`column-width-${column.id}`}
			>
				{m.column_width()}
			</label>
			<select
				id={`column-width-${column.id}`}
				class={[
					'mb-3 h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-slate-950 transition outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50 dark:focus:border-sky-400 dark:focus:ring-sky-950',
					textClass.control
				]}
				value={column.width}
				onchange={selectColumnWidth}
			>
				{#each columnWidths as width (width)}
					<option value={width}>{columnWidthLabels[width]()}</option>
				{/each}
			</select>

			<div class="grid grid-cols-2 gap-2">
				<button
					type="button"
					class={[settingsActionClass, textClass.control]}
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
					class={[settingsActionClass, textClass.control]}
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
				class={[
					'mt-2 flex h-9 w-full items-center justify-center gap-2 rounded-md px-3 font-semibold text-rose-600 transition hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/40',
					textClass.control
				]}
				onclick={onDelete}
			>
				<Trash2 class="size-4 shrink-0" aria-hidden="true" />
				<span>{m.delete_column()}</span>
			</button>
		</div>
	{/if}

	<div class="min-h-0 flex-1 overflow-y-auto">
		{#if column.type === 'website'}
			<iframe
				class="h-full w-full border-0 bg-white dark:bg-slate-950"
				src={column.url}
				title={getColumnTitle(column)}
				sandbox="allow-scripts allow-forms allow-same-origin allow-popups"
			></iframe>
		{:else if column.timelineKind === 'custom'}
			{#if column.error}
				<div
					class={[
						'flex h-full items-center justify-center p-6 text-center font-semibold text-rose-600 dark:text-rose-400',
						textClass.control
					]}
				>
					{m.custom_timeline_error({ message: column.error })}
				</div>
			{:else if column.isLoading && column.posts.length === 0}
				<div
					class={[
						'flex h-full items-center justify-center p-6 text-center text-slate-500 dark:text-slate-400',
						textClass.control
					]}
				>
					{m.custom_timeline_loading()}
				</div>
			{:else if column.posts.length === 0}
				<div
					class={[
						'flex h-full items-center justify-center p-6 text-center text-slate-500 dark:text-slate-400',
						textClass.control
					]}
				>
					{m.custom_timeline_empty()}
				</div>
			{:else}
				{#each column.posts as post (post.id ?? `${column.id}-${post.author}-${post.time}`)}
					<PostCard {post} {textClass} {avatarShape} />
				{/each}
			{/if}
		{:else}
			{#each column.posts as post (`${column.id}-${post.author}-${post.time}`)}
				<PostCard {post} {textClass} {avatarShape} />
			{/each}
		{/if}
	</div>
</section>
