<script lang="ts">
	import { m } from '$lib/paraglide/messages.js';
	import type { CustomTimelineColumnConfig, NostrFilter, RelaySelection } from '$lib/deck/types';
	import type { AccountRelayOption } from '$lib/deck/relay-selection-controller.svelte';
	import type { FontSizeTextClasses } from '$lib/font-size';
	import { parseNostrFilters } from '$lib/nostr/filters';
	import type { Profile } from '$lib/nostr/profiles';
	import InputHelpButton from './InputHelpButton.svelte';
	import RelaySelectionEditor from './RelaySelectionEditor.svelte';

	type Props = {
		column: CustomTimelineColumnConfig;
		textClass: FontSizeTextClasses;
		accountRelayOptions: AccountRelayOption[];
		getProfile: (pubkey: string) => Profile | undefined;
		requestProfiles: (pubkeys: string[], relays: string[]) => void;
		profileRelays: string[];
		onSave: (filters: NostrFilter[], relays: RelaySelection) => void;
	};

	const {
		column,
		textClass,
		accountRelayOptions,
		getProfile,
		requestProfiles,
		profileRelays,
		onSave
	}: Props = $props();

	let filterDraftColumnId = $state('');
	let filterDraftSource = $state('');
	let filterDraft = $state('');
	let relayDraftSource = $state('');
	let relayDraft = $state<RelaySelection | null>(null);

	const parsedFilterDraft = $derived(parseNostrFilters(filterDraft));
	const canSave = $derived(parseNostrFilters(filterDraft) !== null && relayDraft !== null);

	$effect(() => {
		const nextFilterDraft = JSON.stringify(column.filters, null, 2);
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
		relayDraft = column.relays;
	});

	$effect(() => {
		if (accountRelayOptions.length === 0) {
			return;
		}

		requestProfiles(
			accountRelayOptions.map(({ pubkey }) => pubkey),
			profileRelays
		);
	});

	function save() {
		if (!parsedFilterDraft || !relayDraft) {
			return;
		}

		onSave(parsedFilterDraft, relayDraft);
	}
</script>

<div class="mb-2 flex items-center justify-between gap-2">
	<label
		class={['block font-semibold text-slate-700 dark:text-slate-300', textClass.control]}
		for={`column-filters-${column.id}`}
	>
		{m.custom_timeline_filters()}
	</label>
	<InputHelpButton {textClass} helpText={m.custom_timeline_filters_help()} />
</div>
<textarea
	id={`column-filters-${column.id}`}
	class={[
		'mb-3 min-h-32 w-full resize-y rounded-md border border-slate-300 bg-white px-3 py-2 font-mono text-slate-950 transition outline-none placeholder:text-slate-400 focus:border-sky-500 focus:ring-2 focus:ring-sky-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50 dark:placeholder:text-slate-500 dark:focus:border-sky-400 dark:focus:ring-sky-950',
		textClass.control
	]}
	bind:value={filterDraft}
></textarea>

<RelaySelectionEditor
	id={`custom-${column.id}`}
	bind:value={relayDraft}
	{textClass}
	{accountRelayOptions}
	{getProfile}
	{requestProfiles}
	{profileRelays}
/>
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
