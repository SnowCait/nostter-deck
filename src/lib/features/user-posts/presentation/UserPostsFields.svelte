<script lang="ts">
	import { untrack } from 'svelte';
	import RelaySelectionEditor from '$lib/components/deck/RelaySelectionEditor.svelte';
	import type { FontSizeTextClasses } from '$lib/font-size';
	import { encodeNpub } from '$lib/nostr/nip19';
	import { m } from '$lib/paraglide/messages.js';
	import {
		parseUserPostsTarget,
		resolveUserPostsSettings,
		type UserPostsDraft,
		type UserPostsSettings
	} from '../domain/user-posts-actions';

	type Props = {
		id: string;
		textClass: FontSizeTextClasses;
		settings?: UserPostsSettings;
		onChange?: (settings: UserPostsSettings | null) => void;
		onSave?: (settings: UserPostsSettings) => void;
	};

	const { id, textClass, settings, onChange, onSave }: Props = $props();

	let draft = $state<UserPostsDraft>(
		untrack(() => ({
			target: settings ? encodeNpub(settings.pubkey) : '',
			relays: settings?.relays ?? { type: 'nip65-write', pubkey: '' },
			includeReplies: settings?.includeReplies ?? true,
			includeReposts: settings?.includeReposts ?? true
		}))
	);
	const pubkey = $derived(parseUserPostsTarget(draft.target));
	const resolved = $derived(resolveUserPostsSettings(draft));

	$effect(() => {
		onChange?.(resolved);
	});
</script>

<label
	class={['mb-2 block font-semibold text-slate-700 dark:text-slate-300', textClass.control]}
	for={`${id}-target`}
>
	{m.user_posts_target()}
</label>
<input
	id={`${id}-target`}
	class={[
		'mb-3 h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-slate-950 transition outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50 dark:focus:border-sky-400 dark:focus:ring-sky-950',
		textClass.control
	]}
	bind:value={draft.target}
/>
<label class={['mb-2 flex items-center gap-2', textClass.control]}>
	<input type="checkbox" bind:checked={draft.includeReplies} />
	{m.user_posts_include_replies()}
</label>
<label class={['mb-3 flex items-center gap-2', textClass.control]}>
	<input type="checkbox" bind:checked={draft.includeReposts} />
	{m.user_posts_include_reposts()}
</label>
<RelaySelectionEditor {id} bind:value={draft.relays} targetPubkey={pubkey} {textClass} />
{#if onSave}
	<button
		type="button"
		class={[
			'mb-3 flex h-9 w-full items-center justify-center rounded-md bg-sky-500 px-3 font-semibold text-white transition hover:bg-sky-600 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500 dark:bg-sky-400 dark:text-slate-950 dark:hover:bg-sky-300 disabled:dark:bg-slate-800 disabled:dark:text-slate-500',
			textClass.control
		]}
		disabled={!resolved}
		onclick={() => resolved && onSave(resolved)}
	>
		{m.save()}
	</button>
{/if}
