<script lang="ts">
	import { neventEncode } from 'nostr-tools/nip19';
	import type * as Nostr from 'nostr-typedef';
	import { m } from '$lib/paraglide/messages.js';
	import { getQuoteTags } from '$lib/nostr/posts';
	import { normalizeRelay } from '$lib/nostr/relays';
	import type { FontSizeTextClasses } from '$lib/font-size';
	import type { AvatarShape } from '$lib/user-settings';
	import type { Profile } from '$lib/nostr/profiles';
	import type { Post } from '$lib/features/posts/types';
	import { linkifyPostContent } from '$lib/features/posts/domain/post-content-links';
	import NostrQuoteCard from '$lib/features/posts/presentation/NostrQuoteCard.svelte';
	import type { classifyNotification } from '../domain/notification-actions';

	type Props = {
		event: Nostr.Event;
		notification: ReturnType<typeof classifyNotification>;
		getEvent: (id: string) => Nostr.Event | undefined;
		isReferenceUnavailable: (id: string) => boolean;
		textClass: FontSizeTextClasses;
		avatarShape: AvatarShape;
		getProfile: (pubkey: string) => Profile | undefined;
		isMutedUser: (pubkey: string) => boolean;
		onOpenThread: (post: Post) => void;
	};

	const {
		event,
		notification,
		getEvent,
		isReferenceUnavailable,
		textClass,
		avatarShape,
		getProfile,
		isMutedUser,
		onOpenThread
	}: Props = $props();

	const label = {
		reply: m.notifications_reply,
		mention: m.notifications_mention,
		quote: m.notifications_quote,
		reaction: m.notifications_reaction,
		repost: m.notifications_repost
	};

	const supplementalQuotes = $derived.by(() => {
		if (notification.relatedEventIds.length === 0) {
			return [];
		}
		const inlineIds = new Set(
			linkifyPostContent(event.content).flatMap((token) =>
				token.type === 'nostrReference' && token.eventId ? [token.eventId] : []
			)
		);
		return notification.relatedEventIds.filter((id) => !inlineIds.has(id));
	});
</script>

<div
	class={[
		'flex flex-wrap gap-2 px-3 pt-2 font-semibold text-slate-600 dark:text-slate-300',
		textClass.meta
	]}
>
	{#each notification.types as type (type)}
		<span>{label[type]()}</span>
	{/each}
</div>
{#each supplementalQuotes as eventId (eventId)}
	{@const related = getEvent(eventId)}
	{@const relayHint = normalizeRelay(getQuoteTags(event).find((tag) => tag[1] === eventId)?.[2])}
	<div class="px-3">
		<NostrQuoteCard
			href={`nostr:${neventEncode({ id: eventId })}`}
			{eventId}
			relayHints={relayHint ? [relayHint] : []}
			referenceState={related
				? { status: 'loaded', event: related }
				: isReferenceUnavailable(event.id)
					? { status: 'unavailable' }
					: { status: 'loading' }}
			{textClass}
			{avatarShape}
			{getProfile}
			{isMutedUser}
			{onOpenThread}
		/>
	</div>
{/each}
