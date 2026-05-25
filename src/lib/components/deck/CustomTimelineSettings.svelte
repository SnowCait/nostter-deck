<script lang="ts">
	import { m } from '$lib/paraglide/messages.js';
	import type { CustomTimelineColumnConfig, NostrFilter, RelaySelection } from '$lib/deck/types';
	import type { FontSizeTextClasses } from '$lib/font-size';
	import { parseNostrFilters } from '$lib/nostr/filters';
	import {
		defaultRelays,
		formatCustomRelays,
		getSelectedDefaultRelays,
		resolveRelayDraft,
		resolveRelaySelection
	} from '$lib/nostr/relays';
	import FilterHelpButton from './FilterHelpButton.svelte';

	type Props = {
		column: CustomTimelineColumnConfig;
		textClass: FontSizeTextClasses;
		onSave: (filters: NostrFilter[], relays: RelaySelection) => void;
	};

	const { column, textClass, onSave }: Props = $props();

	let filterDraftColumnId = $state('');
	let filterDraftSource = $state('');
	let filterDraft = $state('');
	let relayDraftSource = $state('');
	let selectedDefaultRelays = $state<string[]>([]);
	let customRelayDraft = $state('');

	const parsedFilterDraft = $derived(parseNostrFilters(filterDraft));
	const selectedDefaultRelaySet = $derived(new Set(selectedDefaultRelays));
	const parsedRelayDraft = $derived(resolveRelayDraft(selectedDefaultRelays, customRelayDraft));
	const canSave = $derived(parsedFilterDraft !== null && parsedRelayDraft !== null);

	$effect(() => {
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

	function toggleDefaultRelay(relay: string, isSelected: boolean) {
		selectedDefaultRelays = isSelected
			? [...selectedDefaultRelaySet, relay]
			: selectedDefaultRelays.filter((selectedRelay) => selectedRelay !== relay);
	}

	function save() {
		if (!parsedFilterDraft || !parsedRelayDraft) return;

		onSave(parsedFilterDraft, parsedRelayDraft);
	}
</script>

<div class="mb-2 flex items-center justify-between gap-2">
	<label
		class={['block font-semibold text-slate-700 dark:text-slate-300', textClass.control]}
		for={`column-filters-${column.id}`}
	>
		{m.custom_timeline_filters()}
	</label>
	<FilterHelpButton {textClass} />
</div>
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
	disabled={!canSave}
	onclick={save}
>
	{m.save()}
</button>
