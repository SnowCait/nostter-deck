<script lang="ts">
	import { neventEncode } from 'nostr-tools/nip19';
	import { eventToPost } from '$lib/nostr/posts';
	import { getNostrQuoteState, requestNostrQuote } from '$lib/nostr/quotes.svelte';
	import { m } from '$lib/paraglide/messages.js';
	import type { Post } from '$lib/deck/types';
	import type { FontSizeTextClasses } from '$lib/font-size';
	import type { AvatarShape } from '$lib/user-settings';
	import type { Profile } from '$lib/nostr/profiles';
	import ProfileAvatar from './ProfileAvatar.svelte';
	import MutedContentPlaceholder from './MutedContentPlaceholder.svelte';
	import CustomEmojiText from './CustomEmojiText.svelte';
	import ContentWarningPlaceholder from './ContentWarningPlaceholder.svelte';
	import EventJsonMenu from './EventJsonMenu.svelte';

	type Props = {
		href: string;
		eventId: string;
		relayHints: string[];
		textClass: FontSizeTextClasses;
		avatarShape: AvatarShape;
		getProfile: (pubkey: string) => Profile | undefined;
		isMutedUser: (pubkey: string) => boolean;
		onOpenThread?: (post: Post) => void;
	};

	let {
		href,
		eventId,
		relayHints,
		textClass,
		avatarShape,
		getProfile,
		isMutedUser,
		onOpenThread
	}: Props = $props();
	let isMutedQuoteRevealed = $state(false);
	let isSensitiveQuoteRevealed = $state(false);

	const quoteState = $derived(getNostrQuoteState(eventId));
	const loadedQuoteEvent = $derived(quoteState?.status === 'loaded' ? quoteState.event : undefined);
	const quotedPost = $derived.by(() => {
		if (!loadedQuoteEvent) return undefined;

		const post = eventToPost(loadedQuoteEvent, getProfile(loadedQuoteEvent.pubkey));
		if (!post.thread) return post;

		return {
			...post,
			thread: {
				...post.thread,
				relayHints: [...new Set([...post.thread.relayHints, ...relayHints])]
			}
		};
	});
	const shortenedReference = $derived(`nostr:${neventEncode({ id: eventId }).slice(0, 12)}`);
	const isMutedQuote = $derived(
		Boolean(loadedQuoteEvent && isMutedUser(loadedQuoteEvent.pubkey) && !isMutedQuoteRevealed)
	);
	const isSensitiveQuote = $derived(
		Boolean(quotedPost?.contentWarning) && !isSensitiveQuoteRevealed
	);
	const canOpenThread = $derived(Boolean(quotedPost?.thread && onOpenThread));

	function openThread() {
		if (!quotedPost?.thread) return;
		onOpenThread?.(quotedPost);
	}

	$effect(() => requestNostrQuote(eventId, relayHints));
</script>

{#snippet quoteContent()}
	{#if quotedPost}
		<span class="flex min-w-0 flex-1 gap-3">
			<ProfileAvatar
				shape={avatarShape}
				sizeClass="size-9"
				imageUrl={quotedPost.avatarUrl}
				fallbackText={quotedPost.author.slice(0, 1)}
				fallbackClass={`${quotedPost.accent} text-sm font-bold text-white`}
			/>
			<span class="flex min-w-0 flex-1 flex-col">
				<span class="flex min-w-0 items-center gap-1.5">
					<span class={['truncate font-bold', textClass.account]}>
						<CustomEmojiText text={quotedPost.author} customEmojis={quotedPost.authorEmojis} />
					</span>
					<span class={['shrink-0 text-slate-500 dark:text-slate-400', textClass.meta]}>
						· {quotedPost.time}
					</span>
				</span>
				<span
					class={['mt-1 line-clamp-2 [overflow-wrap:anywhere] whitespace-pre-wrap', textClass.body]}
				>
					<CustomEmojiText
						text={quotedPost.body}
						customEmojis={quotedPost.bodyEmojis}
						whitespaceClass="whitespace-pre-wrap"
					/>
				</span>
			</span>
		</span>
	{:else if quoteState?.status === 'unavailable'}
		<span class="flex min-w-0 flex-1 items-center justify-center">
			<span class={['truncate font-medium text-slate-500 dark:text-slate-400', textClass.body]}>
				{shortenedReference}
			</span>
		</span>
	{:else}
		<span class="flex w-full flex-col justify-center gap-3" aria-hidden="true">
			<span class="h-4 w-1/3 rounded bg-slate-200 dark:bg-slate-800"></span>
			<span class="h-4 w-3/4 rounded bg-slate-200 dark:bg-slate-800"></span>
			<span class="h-4 w-1/2 rounded bg-slate-200 dark:bg-slate-800"></span>
		</span>
	{/if}
{/snippet}

<div class="relative my-2">
	{#if loadedQuoteEvent}
		<EventJsonMenu sourceEvent={loadedQuoteEvent} {textClass} class="absolute top-2 right-2 z-10" />
	{/if}

	{#if isMutedQuote}
		<MutedContentPlaceholder
			message={m.muted_quote()}
			actionLabel={m.show_muted_quote()}
			{textClass}
			testId="muted-quote"
			class="h-28 rounded-md border border-slate-200 dark:border-slate-800"
			onReveal={() => (isMutedQuoteRevealed = true)}
		/>
	{:else if isSensitiveQuote}
		<ContentWarningPlaceholder
			reason={quotedPost?.contentWarning?.reason}
			{textClass}
			testId="content-warning-quote"
			class="h-28"
			onReveal={() => (isSensitiveQuoteRevealed = true)}
		/>
	{:else if canOpenThread}
		<button
			type="button"
			title={m.open_thread()}
			aria-label={m.open_thread()}
			data-testid="nostr-quote"
			class="flex h-28 w-full overflow-hidden rounded-md border border-slate-200 bg-slate-50 p-3 pr-11 text-left text-slate-700 transition hover:border-slate-300 hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-slate-700 dark:hover:bg-slate-800"
			onclick={openThread}
		>
			{@render quoteContent()}
		</button>
	{:else}
		<a
			{href}
			target="_blank"
			rel="external noopener noreferrer"
			data-testid="nostr-quote"
			class="flex h-28 overflow-hidden rounded-md border border-slate-200 bg-slate-50 p-3 pr-11 text-slate-700 transition hover:border-slate-300 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-slate-700 dark:hover:bg-slate-800"
		>
			{@render quoteContent()}
		</a>
	{/if}
</div>
