<script lang="ts">
	import { npubEncode } from 'nostr-tools/nip19';
	import { m } from '$lib/paraglide/messages.js';
	import type { CustomTimelineColumnConfig, NostrFilter, RelaySelection } from '$lib/deck/types';
	import type { AccountRelayOption } from '$lib/deck/relay-selection-controller.svelte';
	import type { FontSizeTextClasses } from '$lib/font-size';
	import { parseNostrFilters } from '$lib/nostr/filters';
	import {
		defaultRelays,
		formatCustomRelays,
		getSelectedDefaultRelays,
		resolveRelayDraft
	} from '$lib/nostr/relays';
	import { getProfileDisplayName, type Profile } from '$lib/nostr/profiles';
	import InputHelpButton from './InputHelpButton.svelte';

	type RelaySelectionMode = 'default' | 'account' | 'custom';

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
	let relaySelectionMode = $state<RelaySelectionMode>('default');
	let selectedAccountRelayPubkey = $state('');
	let selectedDefaultRelays = $state<string[]>([]);
	let customRelayDraft = $state('');

	const parsedFilterDraft = $derived(parseNostrFilters(filterDraft));
	const selectedDefaultRelaySet = $derived(new Set(selectedDefaultRelays));
	const displayedAccountRelayOptions = $derived(getDisplayedAccountRelayOptions());
	const parsedRelayDraft = $derived(resolveRelayDraftForMode());
	const canSave = $derived(parsedFilterDraft !== null && parsedRelayDraft !== null);

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
		if (column.relays.type === 'default') {
			relaySelectionMode = 'default';
			selectedDefaultRelays = [...defaultRelays];
			customRelayDraft = '';
		} else if (column.relays.type === 'nip65') {
			relaySelectionMode = 'account';
			selectedAccountRelayPubkey = column.relays.pubkey;
		} else {
			relaySelectionMode = 'custom';
			selectedDefaultRelays = getSelectedDefaultRelays(column.relays.urls);
			customRelayDraft = formatCustomRelays(column.relays.urls);
		}
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

	function getDisplayedAccountRelayOptions() {
		if (
			!selectedAccountRelayPubkey ||
			accountRelayOptions.some(({ pubkey }) => pubkey === selectedAccountRelayPubkey)
		) {
			return accountRelayOptions;
		}

		return [{ pubkey: selectedAccountRelayPubkey }, ...accountRelayOptions];
	}

	function resolveRelayDraftForMode() {
		if (relaySelectionMode === 'default') {
			return { type: 'default' as const };
		}

		if (relaySelectionMode === 'account') {
			return selectedAccountRelayPubkey
				? { type: 'nip65' as const, pubkey: selectedAccountRelayPubkey }
				: null;
		}

		return resolveRelayDraft(selectedDefaultRelays, customRelayDraft);
	}

	function getAccountRelayName(pubkey: string) {
		return getProfileDisplayName(getProfile(pubkey), pubkey);
	}

	function getAccountRelayNpub(pubkey: string) {
		return `${npubEncode(pubkey).slice(0, 16)}…`;
	}

	function toggleDefaultRelay(relay: string, isSelected: boolean) {
		selectedDefaultRelays = isSelected
			? [...selectedDefaultRelaySet, relay]
			: selectedDefaultRelays.filter((selectedRelay) => selectedRelay !== relay);
	}

	function save() {
		if (!parsedFilterDraft || !parsedRelayDraft) {
			return;
		}

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

<p class={['mb-2 font-semibold text-slate-700 dark:text-slate-300', textClass.control]}>
	{m.custom_timeline_relays()}
</p>
<div class="mb-3 grid grid-cols-3 gap-2" role="radiogroup" aria-label={m.custom_timeline_relays()}>
	<label
		class={[
			'flex min-h-10 min-w-0 cursor-pointer items-center justify-center rounded-md border px-2 text-center font-semibold transition',
			relaySelectionMode === 'default'
				? 'border-sky-500 bg-sky-50 text-sky-700 dark:border-sky-400 dark:bg-sky-950/50 dark:text-sky-300'
				: 'border-slate-300 bg-white text-slate-700 hover:border-slate-400 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-slate-600 dark:hover:bg-slate-800',
			textClass.control
		]}
	>
		<input
			class="sr-only"
			type="radio"
			name={`column-relay-mode-${column.id}`}
			value="default"
			bind:group={relaySelectionMode}
		/>
		<span class="truncate">{m.custom_timeline_relay_mode_default()}</span>
	</label>
	<label
		class={[
			'flex min-h-10 min-w-0 cursor-pointer items-center justify-center rounded-md border px-2 text-center font-semibold transition',
			relaySelectionMode === 'account'
				? 'border-sky-500 bg-sky-50 text-sky-700 dark:border-sky-400 dark:bg-sky-950/50 dark:text-sky-300'
				: 'border-slate-300 bg-white text-slate-700 hover:border-slate-400 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-slate-600 dark:hover:bg-slate-800',
			accountRelayOptions.length === 0 && !selectedAccountRelayPubkey
				? 'cursor-not-allowed opacity-50'
				: '',
			textClass.control
		]}
	>
		<input
			class="sr-only"
			type="radio"
			name={`column-relay-mode-${column.id}`}
			value="account"
			bind:group={relaySelectionMode}
			disabled={accountRelayOptions.length === 0 && !selectedAccountRelayPubkey}
		/>
		<span class="truncate">{m.custom_timeline_relay_mode_account()}</span>
	</label>
	<label
		class={[
			'flex min-h-10 min-w-0 cursor-pointer items-center justify-center rounded-md border px-2 text-center font-semibold transition',
			relaySelectionMode === 'custom'
				? 'border-sky-500 bg-sky-50 text-sky-700 dark:border-sky-400 dark:bg-sky-950/50 dark:text-sky-300'
				: 'border-slate-300 bg-white text-slate-700 hover:border-slate-400 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-slate-600 dark:hover:bg-slate-800',
			textClass.control
		]}
	>
		<input
			class="sr-only"
			type="radio"
			name={`column-relay-mode-${column.id}`}
			value="custom"
			bind:group={relaySelectionMode}
		/>
		<span class="truncate">{m.custom_timeline_relay_mode_custom()}</span>
	</label>
</div>

{#if relaySelectionMode === 'account'}
	<p class={['mb-2 font-semibold text-slate-700 dark:text-slate-300', textClass.control]}>
		{m.custom_timeline_account_relays()}
	</p>
	<div class="mb-3 grid gap-2">
		{#each displayedAccountRelayOptions as option (option.pubkey)}
			<label
				class={[
					'flex min-w-0 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300',
					textClass.control
				]}
			>
				<input
					class="size-4 shrink-0 accent-sky-500"
					type="radio"
					name={`column-account-relay-${column.id}`}
					value={option.pubkey}
					bind:group={selectedAccountRelayPubkey}
				/>
				<span class="min-w-0 flex-1">
					<span class="block truncate font-semibold">{getAccountRelayName(option.pubkey)}</span>
					<span class={['block truncate text-slate-500 dark:text-slate-400', textClass.meta]}>
						{getAccountRelayNpub(option.pubkey)}
					</span>
				</span>
			</label>
		{:else}
			<p class={['text-slate-500 dark:text-slate-400', textClass.meta]}>
				{m.custom_timeline_account_relays_empty()}
			</p>
		{/each}
	</div>
{:else if relaySelectionMode === 'custom'}
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

	<div class="mb-2 flex items-center justify-between gap-2">
		<label
			class={['block font-semibold text-slate-700 dark:text-slate-300', textClass.control]}
			for={`column-custom-relays-${column.id}`}
		>
			{m.custom_timeline_custom_relays()}
		</label>
		<InputHelpButton {textClass} helpText={m.custom_timeline_custom_relays_help()} />
	</div>
	<textarea
		id={`column-custom-relays-${column.id}`}
		class={[
			'mb-3 min-h-24 w-full resize-y rounded-md border border-slate-300 bg-white px-3 py-2 font-mono text-slate-950 transition outline-none placeholder:text-slate-400 focus:border-sky-500 focus:ring-2 focus:ring-sky-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50 dark:placeholder:text-slate-500 dark:focus:border-sky-400 dark:focus:ring-sky-950',
			textClass.control
		]}
		bind:value={customRelayDraft}
	></textarea>
{/if}
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
