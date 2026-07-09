<script lang="ts">
	import { npubEncode } from 'nostr-tools/nip19';
	import * as Dialog from '$lib/components/ui/dialog';
	import { createColumnConfigFromDraft, type AddColumnType } from '$lib/deck/add-column';
	import { columnSourceKeys } from '$lib/deck/data';
	import type { ColumnConfig, ColumnIconKey } from '$lib/deck/types';
	import type { AccountRelayOption } from '$lib/deck/relay-selection-controller.svelte';
	import { normalizeWebsiteUrl } from '$lib/deck/website-url';
	import type { FontSizeTextClasses } from '$lib/font-size';
	import { parseNostrFilters } from '$lib/nostr/filters';
	import { decodeChannelPointer, decodeProfilePointer } from '$lib/nostr/nip19';
	import { defaultRelays, resolveRelayDraft } from '$lib/nostr/relays';
	import { getProfileDisplayName, type Profile } from '$lib/nostr/profiles';
	import { m } from '$lib/paraglide/messages.js';
	import ColumnIconGlyph from './ColumnIconGlyph.svelte';
	import InputHelpButton from './InputHelpButton.svelte';

	type RelaySelectionMode = 'default' | 'account' | 'custom';

	type Props = {
		isOpen: boolean;
		textClass: FontSizeTextClasses;
		createColumnId: () => string;
		accountPubkey: string | null;
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
		accountPubkey,
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
	let relaySelectionMode = $state<RelaySelectionMode>('default');
	let selectedAccountRelayPubkey = $state('');
	let selectedDefaultRelays = $state<string[]>([...defaultRelays]);
	let customTimelineRelays = $state('');
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
	const selectedDefaultRelaySet = $derived(new Set(selectedDefaultRelays));
	const accountRelayPubkeySet = $derived(new Set(accountRelayOptions.map(({ pubkey }) => pubkey)));
	const parsedCustomTimelineRelays = $derived(resolveCustomTimelineRelays());
	const canSaveColumn = $derived(createColumnConfigFromDraft(getColumnDraft('')) !== null);

	$effect(() => {
		if (isOpen && !wasOpen) {
			resetDraft();
		}
		wasOpen = isOpen;
	});

	$effect(() => {
		if (accountRelayOptions.length === 0) {
			if (relaySelectionMode === 'account') {
				relaySelectionMode = 'default';
			}
			selectedAccountRelayPubkey = '';
			return;
		}

		if (!accountRelayPubkeySet.has(selectedAccountRelayPubkey)) {
			selectedAccountRelayPubkey = getDefaultAccountRelayPubkey();
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
		relaySelectionMode = 'default';
		selectedAccountRelayPubkey = getDefaultAccountRelayPubkey();
		selectedDefaultRelays = [...defaultRelays];
		customTimelineRelays = '';
	}

	function getDefaultAccountRelayPubkey() {
		const activePubkey = accountPubkey?.toLowerCase();
		return (
			accountRelayOptions.find(({ pubkey }) => pubkey === activePubkey)?.pubkey ??
			accountRelayOptions[0]?.pubkey ??
			''
		);
	}

	function resolveCustomTimelineRelays() {
		if (relaySelectionMode === 'default') {
			return { type: 'default' as const };
		}

		if (relaySelectionMode === 'account') {
			return accountRelayPubkeySet.has(selectedAccountRelayPubkey)
				? { type: 'nip65' as const, pubkey: selectedAccountRelayPubkey }
				: null;
		}

		return resolveRelayDraft(selectedDefaultRelays, customTimelineRelays);
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

			<p class={['mt-4 mb-2 font-semibold text-slate-700 dark:text-slate-300', textClass.control]}>
				{m.custom_timeline_relays()}
			</p>
			<div class="grid grid-cols-3 gap-2" role="radiogroup" aria-label={m.custom_timeline_relays()}>
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
						name="custom-timeline-relay-mode"
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
						accountRelayOptions.length === 0 ? 'cursor-not-allowed opacity-50' : '',
						textClass.control
					]}
				>
					<input
						class="sr-only"
						type="radio"
						name="custom-timeline-relay-mode"
						value="account"
						bind:group={relaySelectionMode}
						disabled={accountRelayOptions.length === 0}
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
						name="custom-timeline-relay-mode"
						value="custom"
						bind:group={relaySelectionMode}
					/>
					<span class="truncate">{m.custom_timeline_relay_mode_custom()}</span>
				</label>
			</div>

			{#if relaySelectionMode === 'account'}
				<p
					class={['mt-4 mb-2 font-semibold text-slate-700 dark:text-slate-300', textClass.control]}
				>
					{m.custom_timeline_account_relays()}
				</p>
				<div class="grid gap-2">
					{#each accountRelayOptions as option (option.pubkey)}
						<label
							class={[
								'flex min-w-0 items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300',
								textClass.control
							]}
						>
							<input
								class="size-4 shrink-0 accent-sky-500"
								type="radio"
								name="custom-timeline-account-relay"
								value={option.pubkey}
								bind:group={selectedAccountRelayPubkey}
							/>
							<span class="min-w-0 flex-1">
								<span class="block truncate font-semibold"
									>{getAccountRelayName(option.pubkey)}</span
								>
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
				<div class="mt-4 grid gap-2">
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

				<div class="mt-4 mb-2 flex items-center justify-between gap-2">
					<label
						class={['block font-semibold text-slate-700 dark:text-slate-300', textClass.control]}
						for="custom-timeline-relays"
					>
						{m.custom_timeline_custom_relays()}
					</label>
					<InputHelpButton {textClass} helpText={m.custom_timeline_custom_relays_help()} />
				</div>
				<textarea
					id="custom-timeline-relays"
					class={[
						'min-h-24 w-full resize-y rounded-md border border-slate-300 bg-white px-3 py-2 font-mono text-slate-950 transition outline-none placeholder:text-slate-400 focus:border-sky-500 focus:ring-2 focus:ring-sky-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50 dark:placeholder:text-slate-500 dark:focus:border-sky-400 dark:focus:ring-sky-950',
						textClass.control
					]}
					bind:value={customTimelineRelays}
				></textarea>
			{/if}
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
