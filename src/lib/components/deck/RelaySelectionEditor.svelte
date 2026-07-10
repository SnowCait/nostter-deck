<script lang="ts">
	import { npubEncode } from 'nostr-tools/nip19';
	import { m } from '$lib/paraglide/messages.js';
	import type { RelaySelection } from '$lib/deck/types';
	import type { AccountRelayOption } from '$lib/deck/relay-selection-controller.svelte';
	import type { FontSizeTextClasses } from '$lib/font-size';
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
		id: string;
		value: RelaySelection | null;
		textClass: FontSizeTextClasses;
		accountRelayOptions: AccountRelayOption[];
		getProfile: (pubkey: string) => Profile | undefined;
		requestProfiles: (pubkeys: string[], relays: string[]) => void;
		profileRelays: string[];
	};

	let {
		id,
		value = $bindable(),
		textClass,
		accountRelayOptions,
		getProfile,
		requestProfiles,
		profileRelays
	}: Props = $props();

	let relayDraftSource = $state('');
	let relaySelectionMode = $state<RelaySelectionMode>('default');
	let selectedAccountRelayPubkey = $state('');
	let selectedDefaultRelays = $state<string[]>([...defaultRelays]);
	let customRelayDraft = $state('');

	const selectedDefaultRelaySet = $derived(new Set(selectedDefaultRelays));
	const displayedAccountRelayOptions = $derived(getDisplayedAccountRelayOptions());
	const resolvedRelayDraft = $derived(resolveRelayDraftForMode());

	$effect(() => {
		const nextRelayDraftSource = JSON.stringify(value);
		if (relayDraftSource === nextRelayDraftSource) {
			return;
		}

		relayDraftSource = nextRelayDraftSource;
		if (!value || value.type === 'default') {
			relaySelectionMode = 'default';
			selectedDefaultRelays = [...defaultRelays];
			customRelayDraft = '';
			return;
		}

		if (value.type === 'nip65') {
			relaySelectionMode = 'account';
			selectedAccountRelayPubkey = value.pubkey;
			return;
		}

		relaySelectionMode = 'custom';
		selectedDefaultRelays = getSelectedDefaultRelays(value.urls);
		customRelayDraft = formatCustomRelays(value.urls);
	});

	$effect(() => {
		if (accountRelayOptions.length === 0) {
			if (relaySelectionMode === 'account' && !selectedAccountRelayPubkey) {
				relaySelectionMode = 'default';
			}
			return;
		}

		if (relaySelectionMode === 'account' && !selectedAccountRelayPubkey) {
			selectedAccountRelayPubkey = accountRelayOptions[0]?.pubkey ?? '';
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

	$effect(() => {
		const nextValue = resolvedRelayDraft;
		const nextValueSource = JSON.stringify(nextValue);
		if (relayDraftSource === nextValueSource) {
			return;
		}

		value = nextValue;
		relayDraftSource = nextValueSource;
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
</script>

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
			name={`relay-mode-${id}`}
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
			name={`relay-mode-${id}`}
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
			name={`relay-mode-${id}`}
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
					name={`account-relay-${id}`}
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
			for={`custom-relays-${id}`}
		>
			{m.custom_timeline_custom_relays()}
		</label>
		<InputHelpButton {textClass} helpText={m.custom_timeline_custom_relays_help()} />
	</div>
	<textarea
		id={`custom-relays-${id}`}
		class={[
			'mb-3 min-h-24 w-full resize-y rounded-md border border-slate-300 bg-white px-3 py-2 font-mono text-slate-950 transition outline-none placeholder:text-slate-400 focus:border-sky-500 focus:ring-2 focus:ring-sky-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50 dark:placeholder:text-slate-500 dark:focus:border-sky-400 dark:focus:ring-sky-950',
			textClass.control
		]}
		bind:value={customRelayDraft}
	></textarea>
{/if}
