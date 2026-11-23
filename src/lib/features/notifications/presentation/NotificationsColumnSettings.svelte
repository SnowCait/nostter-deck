<script lang="ts">
	import { m } from '$lib/paraglide/messages.js';
	import type { NotificationsColumnConfig } from '$lib/deck/types';
	import type { RelaySelection } from '$lib/nostr/relays';
	import type { AccountRelayOption } from '$lib/deck/relay-selection-controller.svelte';
	import type { FontSizeTextClasses } from '$lib/font-size';
	import { parseNotificationTarget } from '../domain/notification-actions';
	import { encodeNpub } from '$lib/nostr/nip19';
	import type { Profile } from '$lib/nostr/profiles';
	import RelaySelectionEditor from '$lib/components/deck/RelaySelectionEditor.svelte';

	type Props = {
		column: NotificationsColumnConfig;
		textClass: FontSizeTextClasses;
		accountRelayOptions: AccountRelayOption[];
		getProfile: (pubkey: string) => Profile | undefined;
		requestProfiles: (pubkeys: string[], relays: string[]) => void;
		profileRelays: string[];
		onSave: (pubkey: string, relays: RelaySelection, includeOwnEvents: boolean) => void;
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

	let targetDraft = $state('');
	let relayDraft = $state<RelaySelection | null>(null);
	let includeOwnEvents = $state(false);
	let relayTargetPubkey = $state('');

	const parsedTargetDraft = $derived(parseNotificationTarget(targetDraft));
	const canSave = $derived(parsedTargetDraft !== null && relayDraft !== null);

	$effect(() => {
		targetDraft = encodeNpub(column.pubkey);
		relayDraft = column.relays;
		includeOwnEvents = column.includeOwnEvents;
		relayTargetPubkey = column.pubkey;
	});

	$effect(() => {
		if (!parsedTargetDraft) {
			return;
		}

		const nextPubkey = parsedTargetDraft;
		if (
			relayDraft?.type === 'nip65' &&
			relayDraft.pubkey === relayTargetPubkey &&
			relayDraft.pubkey !== nextPubkey
		) {
			relayDraft = { type: 'nip65', pubkey: nextPubkey };
		}
		relayTargetPubkey = nextPubkey;
	});

	function save() {
		if (!parsedTargetDraft || !relayDraft) {
			return;
		}

		onSave(parsedTargetDraft, relayDraft, includeOwnEvents);
	}
</script>

<label
	class={['mb-2 block font-semibold text-slate-700 dark:text-slate-300', textClass.control]}
	for={`column-notifications-target-${column.id}`}
>
	{m.notifications_target()}
</label>
<input
	id={`column-notifications-target-${column.id}`}
	class={[
		'mb-3 h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-slate-950 transition outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50 dark:focus:border-sky-400 dark:focus:ring-sky-950',
		textClass.control
	]}
	bind:value={targetDraft}
/>
<label class={['mb-3 flex items-center gap-2', textClass.control]}>
	<input type="checkbox" bind:checked={includeOwnEvents} />
	{m.notifications_include_own_events()}
</label>
<RelaySelectionEditor
	id={`notifications-${column.id}`}
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
