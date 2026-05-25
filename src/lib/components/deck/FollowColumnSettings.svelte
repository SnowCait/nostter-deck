<script lang="ts">
	import { m } from '$lib/paraglide/messages.js';
	import type { FollowTimelineColumnConfig } from '$lib/deck/types';
	import type { FontSizeTextClasses } from '$lib/font-size';
	import { decodeProfilePointer, encodeNpub, type ProfilePointer } from '$lib/nostr/nip19';

	type Props = {
		column: FollowTimelineColumnConfig;
		textClass: FontSizeTextClasses;
		onSave: (profile: ProfilePointer) => void;
	};

	const { column, textClass, onSave }: Props = $props();

	let targetDraftColumnId = $state('');
	let targetDraftSource = $state('');
	let targetDraft = $state('');

	const parsedTargetDraft = $derived(decodeProfilePointer(targetDraft));

	$effect(() => {
		if (targetDraftColumnId === column.id && targetDraftSource === column.pubkey) return;

		targetDraftColumnId = column.id;
		targetDraftSource = column.pubkey;
		targetDraft = encodeNpub(column.pubkey);
	});

	function save() {
		if (!parsedTargetDraft) return;

		onSave(parsedTargetDraft);
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
<button
	type="button"
	class={[
		'mb-3 flex h-9 w-full items-center justify-center rounded-md bg-sky-500 px-3 font-semibold text-white transition hover:bg-sky-600 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500 dark:bg-sky-400 dark:text-slate-950 dark:hover:bg-sky-300 disabled:dark:bg-slate-800 disabled:dark:text-slate-500',
		textClass.control
	]}
	disabled={!parsedTargetDraft}
	onclick={save}
>
	{m.save()}
</button>
