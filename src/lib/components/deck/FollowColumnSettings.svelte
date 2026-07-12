<script lang="ts">
	import { m } from '$lib/paraglide/messages.js';
	import type { FollowTimelineColumnConfig, RelaySelection } from '$lib/deck/types';
	import type { AccountRelayOption } from '$lib/deck/relay-selection-controller.svelte';
	import type { FontSizeTextClasses } from '$lib/font-size';
	import { decodeProfilePointer, encodeNpub, type ProfilePointer } from '$lib/nostr/nip19';
	import type { Profile } from '$lib/nostr/profiles';
	import RelaySelectionEditor from './RelaySelectionEditor.svelte';

	type Props = {
		column: FollowTimelineColumnConfig;
		textClass: FontSizeTextClasses;
		accountRelayOptions: AccountRelayOption[];
		getProfile: (pubkey: string) => Profile | undefined;
		requestProfiles: (pubkeys: string[], relays: string[]) => void;
		profileRelays: string[];
		onSave: (profile: ProfilePointer, relays: RelaySelection) => void;
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

	let targetDraftColumnId = $state('');
	let targetDraftSource = $state('');
	let targetDraft = $state('');
	let relayDraftSource = $state('');
	let relayDraft = $state<RelaySelection | null>(null);
	let followRelayTargetPubkey = $state('');

	const parsedTargetDraft = $derived(decodeProfilePointer(targetDraft));
	const canSave = $derived(decodeProfilePointer(targetDraft) !== null && relayDraft !== null);

	$effect(() => {
		const nextRelayDraft = JSON.stringify(column.relays);
		if (
			targetDraftColumnId === column.id &&
			targetDraftSource === column.pubkey &&
			relayDraftSource === nextRelayDraft
		) {
			return;
		}

		targetDraftColumnId = column.id;
		targetDraftSource = column.pubkey;
		relayDraftSource = nextRelayDraft;
		targetDraft = encodeNpub(column.pubkey);
		relayDraft = column.relays;
		followRelayTargetPubkey = column.pubkey;
	});

	$effect(() => {
		if (!parsedTargetDraft) {
			return;
		}

		const nextPubkey = parsedTargetDraft.pubkey;
		const shouldTrackFollowTarget =
			!relayDraft ||
			relayDraft.type === 'default' ||
			(relayDraft.type === 'nip65' && relayDraft.pubkey === followRelayTargetPubkey);
		if (
			shouldTrackFollowTarget &&
			(relayDraft?.type !== 'nip65' || relayDraft.pubkey !== nextPubkey)
		) {
			relayDraft = { type: 'nip65', pubkey: nextPubkey };
		}
		followRelayTargetPubkey = nextPubkey;
	});

	function save() {
		if (!parsedTargetDraft || !relayDraft) {
			return;
		}

		onSave(parsedTargetDraft, relayDraft);
	}
</script>

<label
	class={['mb-2 block font-semibold text-slate-700 dark:text-slate-300', textClass.control]}
	for={`column-follow-target-${column.id}`}
>
	{m.follow_target()}
</label>
<input
	id={`column-follow-target-${column.id}`}
	class={[
		'mb-3 h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-slate-950 transition outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50 dark:focus:border-sky-400 dark:focus:ring-sky-950',
		textClass.control
	]}
	bind:value={targetDraft}
/>
<RelaySelectionEditor
	id={`follow-${column.id}`}
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
