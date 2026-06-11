<script lang="ts">
	import { neventEncode } from 'nostr-tools/nip19';
	import { eventToPost } from '$lib/nostr/posts';
	import { getNostrQuoteState, requestNostrQuote } from '$lib/nostr/quotes.svelte';
	import { m } from '$lib/paraglide/messages.js';
	import type { FontSizeTextClasses } from '$lib/font-size';
	import type { AvatarShape } from '$lib/user-settings';
	import type * as Nostr from 'nostr-typedef';
	import ProfileAvatar from './ProfileAvatar.svelte';
	import MutedContentPlaceholder from './MutedContentPlaceholder.svelte';

	type Props = {
		href: string;
		eventId: string;
		relayHints: string[];
		textClass: FontSizeTextClasses;
		avatarShape: AvatarShape;
		getProfile: (pubkey: string) => Nostr.Content.Metadata | undefined;
		isMutedUser: (pubkey: string) => boolean;
	};

	let { href, eventId, relayHints, textClass, avatarShape, getProfile, isMutedUser }: Props =
		$props();
	let isMutedQuoteRevealed = $state(false);

	const quoteState = $derived(getNostrQuoteState(eventId));
	const quotedPost = $derived(
		quoteState?.status === 'loaded'
			? eventToPost(quoteState.event, getProfile(quoteState.event.pubkey))
			: undefined
	);
	const shortenedReference = $derived(`nostr:${neventEncode({ id: eventId }).slice(0, 12)}`);
	const isMutedQuote = $derived(
		quoteState?.status === 'loaded' && isMutedUser(quoteState.event.pubkey) && !isMutedQuoteRevealed
	);

	$effect(() => requestNostrQuote(eventId, relayHints));
</script>

{#if isMutedQuote}
	<MutedContentPlaceholder
		message={m.muted_quote()}
		actionLabel={m.show_muted_quote()}
		{textClass}
		testId="muted-quote"
		class="my-2 h-28 rounded-md border border-slate-200 dark:border-slate-800"
		onReveal={() => (isMutedQuoteRevealed = true)}
	/>
{:else}
	<a
		{href}
		target="_blank"
		rel="external noopener noreferrer"
		data-testid="nostr-quote"
		class="my-2 flex h-28 overflow-hidden rounded-md border border-slate-200 bg-slate-50 p-3 text-slate-700 transition hover:border-slate-300 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-slate-700 dark:hover:bg-slate-800"
	>
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
						<span class={['truncate font-bold', textClass.account]}>{quotedPost.author}</span>
						<span class={['shrink-0 text-slate-500 dark:text-slate-400', textClass.meta]}>
							· {quotedPost.time}
						</span>
					</span>
					<span
						class={[
							'mt-1 line-clamp-2 [overflow-wrap:anywhere] whitespace-pre-wrap',
							textClass.body
						]}
					>
						{quotedPost.body}
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
	</a>
{/if}
