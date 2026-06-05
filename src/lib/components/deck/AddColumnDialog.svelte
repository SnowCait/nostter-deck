<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog';
	import * as Select from '$lib/components/ui/select';
	import { createColumnConfigFromDraft, type AddColumnType } from '$lib/deck/add-column';
	import { columnSourceKeys } from '$lib/deck/data';
	import type { ColumnConfig } from '$lib/deck/types';
	import { normalizeWebsiteUrl } from '$lib/deck/website-url';
	import type { FontSizeTextClasses } from '$lib/font-size';
	import { parseNostrFilters } from '$lib/nostr/filters';
	import { decodeChannelPointer, decodeProfilePointer } from '$lib/nostr/nip19';
	import { defaultRelays, resolveRelayDraft } from '$lib/nostr/relays';
	import { m } from '$lib/paraglide/messages.js';
	import FilterHelpButton from './FilterHelpButton.svelte';

	type Props = {
		isOpen: boolean;
		textClass: FontSizeTextClasses;
		createColumnId: () => string;
		onSave: (column: ColumnConfig) => void;
	};

	let { isOpen = $bindable(), textClass, createColumnId, onSave }: Props = $props();

	const availableColumnSourceKeys = columnSourceKeys;
	const defaultColumnType = availableColumnSourceKeys[0] ?? 'timeline_search';

	let selectedColumnType = $state<AddColumnType>(defaultColumnType);
	let websiteUrl = $state('');
	let followTarget = $state('');
	let searchQuery = $state('');
	let channelTarget = $state('');
	let customTimelineFilters = $state('[{"kinds":[1],"limit":20}]');
	let selectedDefaultRelays = $state<string[]>([...defaultRelays]);
	let customTimelineRelays = $state('');
	let wasOpen = $state(false);

	const normalizedWebsiteUrl = $derived(normalizeWebsiteUrl(websiteUrl));
	const availableColumnTypes = $derived([
		...availableColumnSourceKeys.map((value) => ({ value, label: m[value]() })),
		{ value: 'custom_timeline' as const, label: m.column_type_custom_timeline() },
		{ value: 'website' as const, label: m.column_type_website() }
	]);
	const selectedColumnTypeLabel = $derived(
		availableColumnTypes.find(({ value }) => value === selectedColumnType)?.label ?? ''
	);
	const parsedFollowTarget = $derived(decodeProfilePointer(followTarget));
	const parsedChannelTarget = $derived(decodeChannelPointer(channelTarget));
	const parsedCustomTimelineFilters = $derived(parseNostrFilters(customTimelineFilters));
	const selectedDefaultRelaySet = $derived(new Set(selectedDefaultRelays));
	const parsedCustomTimelineRelays = $derived(
		resolveRelayDraft(selectedDefaultRelays, customTimelineRelays)
	);
	const canSaveColumn = $derived(createColumnConfigFromDraft(getColumnDraft('')) !== null);

	$effect(() => {
		if (isOpen && !wasOpen) {
			resetDraft();
		}
		wasOpen = isOpen;
	});

	function getColumnDraft(id: string) {
		return {
			id,
			columnType: selectedColumnType,
			websiteUrl: normalizedWebsiteUrl,
			followTarget: parsedFollowTarget,
			searchQuery,
			channelTarget: parsedChannelTarget,
			customTimelineFilters: parsedCustomTimelineFilters,
			customTimelineRelays: parsedCustomTimelineRelays
		};
	}

	function resetDraft() {
		selectedColumnType = defaultColumnType;
		websiteUrl = '';
		followTarget = '';
		searchQuery = '';
		channelTarget = '';
		customTimelineFilters = '[{"kinds":[1],"limit":20}]';
		selectedDefaultRelays = [...defaultRelays];
		customTimelineRelays = '';
	}

	function toggleDefaultRelay(relay: string, isSelected: boolean) {
		selectedDefaultRelays = isSelected
			? [...selectedDefaultRelaySet, relay]
			: selectedDefaultRelays.filter((selectedRelay) => selectedRelay !== relay);
	}

	function close() {
		isOpen = false;
	}

	function save() {
		if (!canSaveColumn) return;

		const nextColumn = createColumnConfigFromDraft(getColumnDraft(createColumnId()));
		if (!nextColumn) return;

		onSave(nextColumn);
		close();
	}
</script>

<Dialog.Root bind:open={isOpen}>
	<Dialog.Content
		class="max-h-[calc(100dvh-2rem)] max-w-sm gap-0 overflow-y-auto overscroll-contain rounded-md border border-slate-200 bg-white p-4 text-slate-950 shadow-xl ring-0 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-50"
		showCloseButton={false}
	>
		<div class="mb-4 flex items-center justify-between gap-3">
			<Dialog.Title class={['font-bold', textClass.heading]}>
				{m.add_column()}
			</Dialog.Title>
		</div>

		<label
			id="column-type-label"
			class={['mb-2 block font-semibold text-slate-700 dark:text-slate-300', textClass.control]}
			for="column-type"
		>
			{m.column_type()}
		</label>
		<Select.Root type="single" items={availableColumnTypes} bind:value={selectedColumnType}>
			<Select.Trigger
				id="column-type"
				aria-labelledby="column-type-label"
				class={[
					'h-10 w-full border-slate-300 bg-white px-3 text-slate-950 shadow-none focus-visible:border-sky-500 focus-visible:ring-2 focus-visible:ring-sky-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50 dark:hover:bg-slate-900 dark:focus-visible:border-sky-400 dark:focus-visible:ring-sky-950',
					textClass.control
				]}
			>
				<span class="truncate">{selectedColumnTypeLabel}</span>
			</Select.Trigger>
			<Select.Content class="z-[60]">
				{#each availableColumnTypes as columnType (columnType.value)}
					<Select.Item value={columnType.value} label={columnType.label} />
				{/each}
			</Select.Content>
		</Select.Root>

		{#if selectedColumnType === 'timeline_follow'}
			<label
				class={[
					'mt-4 mb-2 block font-semibold text-slate-700 dark:text-slate-300',
					textClass.control
				]}
				for="follow-target"
			>
				{m.follow_target()}
			</label>
			<input
				id="follow-target"
				class={[
					'h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-slate-950 transition outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50 dark:focus:border-sky-400 dark:focus:ring-sky-950',
					textClass.control
				]}
				bind:value={followTarget}
			/>
		{/if}

		{#if selectedColumnType === 'timeline_search'}
			<label
				class={[
					'mt-4 mb-2 block font-semibold text-slate-700 dark:text-slate-300',
					textClass.control
				]}
				for="search-query"
			>
				{m.search_query()}
			</label>
			<input
				id="search-query"
				class={[
					'h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-slate-950 transition outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50 dark:focus:border-sky-400 dark:focus:ring-sky-950',
					textClass.control
				]}
				bind:value={searchQuery}
			/>
		{/if}

		{#if selectedColumnType === 'timeline_channel'}
			<label
				class={[
					'mt-4 mb-2 block font-semibold text-slate-700 dark:text-slate-300',
					textClass.control
				]}
				for="channel-target"
			>
				{m.channel_target()}
			</label>
			<input
				id="channel-target"
				class={[
					'h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-slate-950 transition outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50 dark:focus:border-sky-400 dark:focus:ring-sky-950',
					textClass.control
				]}
				bind:value={channelTarget}
			/>
		{/if}

		{#if selectedColumnType === 'custom_timeline'}
			<div class="mt-4 mb-2 flex items-center justify-between gap-2">
				<label
					class={['block font-semibold text-slate-700 dark:text-slate-300', textClass.control]}
					for="custom-timeline-filters"
				>
					{m.custom_timeline_filters()}
				</label>
				<FilterHelpButton {textClass} />
			</div>
			<textarea
				id="custom-timeline-filters"
				class={[
					'min-h-32 w-full resize-y rounded-md border border-slate-300 bg-white px-3 py-2 font-mono text-slate-950 transition outline-none placeholder:text-slate-400 focus:border-sky-500 focus:ring-2 focus:ring-sky-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50 dark:placeholder:text-slate-500 dark:focus:border-sky-400 dark:focus:ring-sky-950',
					textClass.control
				]}
				bind:value={customTimelineFilters}
			></textarea>

			<p class={['mt-4 mb-2 font-semibold text-slate-700 dark:text-slate-300', textClass.control]}>
				{m.custom_timeline_relays()}
			</p>
			<div class="grid gap-2">
				{#each defaultRelays as relay (relay)}
					<label
						class={[
							'flex min-w-0 items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300',
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
				class={[
					'mt-4 mb-2 block font-semibold text-slate-700 dark:text-slate-300',
					textClass.control
				]}
				for="custom-timeline-relays"
			>
				{m.custom_timeline_custom_relays()}
			</label>
			<textarea
				id="custom-timeline-relays"
				class={[
					'min-h-24 w-full resize-y rounded-md border border-slate-300 bg-white px-3 py-2 font-mono text-slate-950 transition outline-none placeholder:text-slate-400 focus:border-sky-500 focus:ring-2 focus:ring-sky-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50 dark:placeholder:text-slate-500 dark:focus:border-sky-400 dark:focus:ring-sky-950',
					textClass.control
				]}
				bind:value={customTimelineRelays}
			></textarea>
		{:else if selectedColumnType === 'website'}
			<label
				class={[
					'mt-4 mb-2 block font-semibold text-slate-700 dark:text-slate-300',
					textClass.control
				]}
				for="website-url"
			>
				{m.website_url()}
			</label>
			<input
				id="website-url"
				class={[
					'h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-slate-950 transition outline-none placeholder:text-slate-400 focus:border-sky-500 focus:ring-2 focus:ring-sky-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50 dark:placeholder:text-slate-500 dark:focus:border-sky-400 dark:focus:ring-sky-950',
					textClass.control
				]}
				type="url"
				placeholder="https://example.com"
				bind:value={websiteUrl}
			/>
		{/if}

		<div class="mt-5 flex justify-end gap-3">
			<div class="flex gap-2">
				<button
					type="button"
					class={[
						'h-9 rounded-md px-3 font-semibold text-slate-600 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-900',
						textClass.control
					]}
					onclick={close}
				>
					{m.cancel()}
				</button>
				<button
					type="button"
					class={[
						'h-9 rounded-md bg-sky-500 px-3 font-semibold text-white transition hover:bg-sky-600 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500 dark:bg-sky-400 dark:text-slate-950 dark:hover:bg-sky-300 disabled:dark:bg-slate-800 disabled:dark:text-slate-500',
						textClass.control
					]}
					disabled={!canSaveColumn}
					onclick={save}
				>
					{m.save()}
				</button>
			</div>
		</div>
	</Dialog.Content>
</Dialog.Root>
