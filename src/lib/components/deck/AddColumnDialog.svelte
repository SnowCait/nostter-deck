<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog';
	import { createColumnConfigFromDraft, type AddColumnType } from '$lib/deck/add-column';
	import { columnSourceKeys } from '$lib/deck/data';
	import type { ColumnConfig, ColumnIconKey, RelaySelection } from '$lib/deck/types';
	import type { AccountRelayOption } from '$lib/deck/relay-selection-controller.svelte';
	import { normalizeWebsiteUrl } from '$lib/deck/website-url';
	import type { FontSizeTextClasses } from '$lib/font-size';
	import { parseNostrFilters } from '$lib/nostr/filters';
	import { decodeChannelPointer, decodeProfilePointer } from '$lib/nostr/nip19';
	import type { Profile } from '$lib/nostr/profiles';
	import { m } from '$lib/paraglide/messages.js';
	import ColumnIconGlyph from './ColumnIconGlyph.svelte';
	import InputHelpButton from './InputHelpButton.svelte';
	import RelaySelectionEditor from './RelaySelectionEditor.svelte';

	type Props = {
		isOpen: boolean;
		textClass: FontSizeTextClasses;
		createColumnId: () => string;
		accountRelayOptions: AccountRelayOption[];
		getProfile: (pubkey: string) => Profile | undefined;
		requestProfiles: (pubkeys: string[], relays: string[]) => void;
		profileRelays: string[];
		onSave: (column: ColumnConfig) => void;
	};

	let {
		isOpen = $bindable(),
		textClass,
		createColumnId,
		accountRelayOptions,
		getProfile,
		requestProfiles,
		profileRelays,
		onSave
	}: Props = $props();

	const availableColumnSourceKeys = columnSourceKeys;
	const defaultColumnType = availableColumnSourceKeys[0] ?? 'timeline_search';
	const columnTypeIconKeys = {
		timeline_follow: 'users',
		timeline_search: 'search',
		timeline_channel: 'messages',
		custom_timeline: 'radio',
		website: 'globe'
	} satisfies Record<AddColumnType, ColumnIconKey>;

	let selectedColumnType = $state<AddColumnType>(defaultColumnType);
	let websiteUrl = $state('');
	let followTarget = $state('');
	let searchQuery = $state('');
	let channelTarget = $state('');
	let customTimelineFilters = $state('[{"kinds":[1],"limit":20}]');
	let presetTimelineRelayDraft = $state<RelaySelection | null>({ type: 'default' });
	let customTimelineRelayDraft = $state<RelaySelection | null>({ type: 'default' });
	let wasOpen = $state(false);

	const normalizedWebsiteUrl = $derived(normalizeWebsiteUrl(websiteUrl));
	const availableColumnTypes = $derived([
		...availableColumnSourceKeys.map((value) => ({
			value,
			label: m[value](),
			iconKey: columnTypeIconKeys[value]
		})),
		{
			value: 'custom_timeline' as const,
			label: m.column_type_custom_timeline(),
			iconKey: columnTypeIconKeys.custom_timeline
		},
		{
			value: 'website' as const,
			label: m.column_type_website(),
			iconKey: columnTypeIconKeys.website
		}
	]);
	const parsedFollowTarget = $derived(decodeProfilePointer(followTarget));
	const parsedChannelTarget = $derived(decodeChannelPointer(channelTarget));
	const parsedCustomTimelineFilters = $derived(parseNostrFilters(customTimelineFilters));
	const parsedPresetTimelineRelays = $derived(resolvePresetTimelineRelays());
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
			presetTimelineRelays: parsedPresetTimelineRelays,
			customTimelineFilters: parsedCustomTimelineFilters,
			customTimelineRelays: customTimelineRelayDraft
		};
	}

	function resetDraft() {
		selectedColumnType = defaultColumnType;
		websiteUrl = '';
		followTarget = '';
		searchQuery = '';
		channelTarget = '';
		customTimelineFilters = '[{"kinds":[1],"limit":20}]';
		presetTimelineRelayDraft = { type: 'default' };
		customTimelineRelayDraft = { type: 'default' };
	}

	function resolvePresetTimelineRelays() {
		if (!presetTimelineRelayDraft || presetTimelineRelayDraft.type !== 'default') {
			return presetTimelineRelayDraft;
		}

		if (selectedColumnType === 'timeline_follow' && (parsedFollowTarget?.relays.length ?? 0) > 0) {
			return null;
		}

		if (
			selectedColumnType === 'timeline_channel' &&
			(parsedChannelTarget?.relays.length ?? 0) > 0
		) {
			return null;
		}

		return presetTimelineRelayDraft;
	}

	function save() {
		if (!canSaveColumn) {
			return;
		}

		const nextColumn = createColumnConfigFromDraft(getColumnDraft(createColumnId()));
		if (!nextColumn) {
			return;
		}

		onSave(nextColumn);
		isOpen = false;
	}
</script>

<Dialog.Root bind:open={isOpen}>
	<Dialog.Content
		class="max-h-[calc(100dvh-2rem)] max-w-sm gap-0 overflow-y-auto overscroll-contain rounded-md border border-slate-200 bg-white p-4 text-slate-950 shadow-xl ring-0 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-50"
		closeLabel={m.close()}
	>
		<div class="mb-4 flex items-center justify-between gap-3 pr-10">
			<Dialog.Title class={['font-bold', textClass.heading]}>
				{m.add_column()}
			</Dialog.Title>
		</div>

		<p
			id="column-type-label"
			class={['mb-2 font-semibold text-slate-700 dark:text-slate-300', textClass.control]}
		>
			{m.column_type()}
		</p>
		<div class="grid grid-cols-2 gap-2" role="radiogroup" aria-labelledby="column-type-label">
			{#each availableColumnTypes as columnType (columnType.value)}
				<label
					class={[
						'flex min-h-16 min-w-0 cursor-pointer items-center gap-2 rounded-md border px-3 py-2 transition',
						selectedColumnType === columnType.value
							? 'border-sky-500 bg-sky-50 text-sky-700 dark:border-sky-400 dark:bg-sky-950/50 dark:text-sky-300'
							: 'border-slate-300 bg-white text-slate-700 hover:border-slate-400 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-slate-600 dark:hover:bg-slate-800',
						'[&:has(input:focus-visible)]:border-sky-500 [&:has(input:focus-visible)]:ring-2 [&:has(input:focus-visible)]:ring-sky-100 dark:[&:has(input:focus-visible)]:border-sky-400 dark:[&:has(input:focus-visible)]:ring-sky-950',
						textClass.control
					]}
				>
					<input
						class="sr-only"
						type="radio"
						name="column-type"
						value={columnType.value}
						bind:group={selectedColumnType}
					/>
					<ColumnIconGlyph iconKey={columnType.iconKey} iconClass="size-5 shrink-0" />
					<span class="min-w-0 truncate font-semibold">{columnType.label}</span>
				</label>
			{/each}
		</div>

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
			<div class="mt-4">
				<RelaySelectionEditor
					id="preset-follow"
					bind:value={presetTimelineRelayDraft}
					{textClass}
					{accountRelayOptions}
					{getProfile}
					{requestProfiles}
					{profileRelays}
				/>
			</div>
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
			<div class="mt-4">
				<RelaySelectionEditor
					id="preset-channel"
					bind:value={presetTimelineRelayDraft}
					{textClass}
					{accountRelayOptions}
					{getProfile}
					{requestProfiles}
					{profileRelays}
				/>
			</div>
		{/if}

		{#if selectedColumnType === 'custom_timeline'}
			<div class="mt-4 mb-2 flex items-center justify-between gap-2">
				<label
					class={['block font-semibold text-slate-700 dark:text-slate-300', textClass.control]}
					for="custom-timeline-filters"
				>
					{m.custom_timeline_filters()}
				</label>
				<InputHelpButton {textClass} helpText={m.custom_timeline_filters_help()} />
			</div>
			<textarea
				id="custom-timeline-filters"
				class={[
					'min-h-32 w-full resize-y rounded-md border border-slate-300 bg-white px-3 py-2 font-mono text-slate-950 transition outline-none placeholder:text-slate-400 focus:border-sky-500 focus:ring-2 focus:ring-sky-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50 dark:placeholder:text-slate-500 dark:focus:border-sky-400 dark:focus:ring-sky-950',
					textClass.control
				]}
				bind:value={customTimelineFilters}
			></textarea>

			<div class="mt-4">
				<RelaySelectionEditor
					id="custom-timeline"
					bind:value={customTimelineRelayDraft}
					{textClass}
					{accountRelayOptions}
					{getProfile}
					{requestProfiles}
					{profileRelays}
				/>
			</div>
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
				<Dialog.Close
					class={[
						'h-9 rounded-md px-3 font-semibold text-slate-600 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-900',
						textClass.control
					]}
				>
					{m.cancel()}
				</Dialog.Close>
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
