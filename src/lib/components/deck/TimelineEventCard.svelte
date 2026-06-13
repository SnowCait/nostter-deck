<script lang="ts">
	import { Reaction, Repost } from 'nostr-tools/kinds';
	import type * as Nostr from 'nostr-typedef';
	import { eventToPost, reactionEventToPost, repostEventToPost } from '$lib/nostr/posts';
	import { getReferencedEventId } from '$lib/deck/timeline-runtime';
	import type { Post } from '$lib/deck/types';
	import type { FontSizeTextClasses } from '$lib/font-size';
	import type { ProfilePointer } from '$lib/nostr/nip19';
	import type { Profile } from '$lib/nostr/profiles';
	import type { AvatarShape } from '$lib/user-settings';
	import PostCard from './PostCard.svelte';

	type Props = {
		eventId: string;
		getEvent: (eventId: string) => Nostr.Event | undefined;
		isReferenceUnavailable: (eventId: string) => boolean;
		isLoggedIn: boolean;
		textClass: FontSizeTextClasses;
		avatarShape: AvatarShape;
		getProfile: (pubkey: string) => Profile | undefined;
		requestProfiles: (pubkeys: string[], relays: string[]) => void;
		profileRelays: string[];
		isMutedUser: (pubkey: string) => boolean;
		onMuteUser: (pubkey: string) => void;
		onOpenProfile: (profile: ProfilePointer) => void;
		onOpenThread: (post: Post) => void;
		onOpenHashtag: (hashtag: string) => void;
	};

	const {
		eventId,
		getEvent,
		isReferenceUnavailable,
		isLoggedIn,
		textClass,
		avatarShape,
		getProfile,
		requestProfiles,
		profileRelays,
		isMutedUser,
		onMuteUser,
		onOpenProfile,
		onOpenThread,
		onOpenHashtag
	}: Props = $props();

	const event = $derived(getEvent(eventId));
	const referencedEventId = $derived(event ? getReferencedEventId(event) : null);
	const referencedEvent = $derived(referencedEventId ? getEvent(referencedEventId) : undefined);
	const referenceUnavailable = $derived(isReferenceUnavailable(eventId));
	const post = $derived(
		event ? createPost(event, referencedEvent, referenceUnavailable, getProfile) : undefined
	);
	const isMuted = $derived(
		post ? Boolean(post.referenceType) && post.mutePubkeys.some(isMutedUser) : false
	);
	const isHidden = $derived(
		Boolean(post && !post.referenceType && post.mutePubkeys.some(isMutedUser))
	);

	function createPost(
		sourceEvent: Nostr.Event,
		targetEvent: Nostr.Event | undefined,
		isUnavailable: boolean,
		profileLookup: (pubkey: string) => Profile | undefined
	) {
		const nextPost =
			sourceEvent.kind === Repost
				? repostEventToPost(sourceEvent, targetEvent, profileLookup)
				: sourceEvent.kind === Reaction
					? reactionEventToPost(sourceEvent, targetEvent, profileLookup)
					: eventToPost(sourceEvent, profileLookup(sourceEvent.pubkey));

		if (nextPost.referenceType) {
			nextPost.referenceStatus = targetEvent ? 'loaded' : isUnavailable ? 'unavailable' : 'loading';
		}

		return nextPost;
	}
</script>

{#if post && !isHidden}
	<PostCard
		{post}
		{isLoggedIn}
		{textClass}
		{avatarShape}
		{getProfile}
		{requestProfiles}
		{profileRelays}
		{isMuted}
		{isMutedUser}
		{onMuteUser}
		{onOpenProfile}
		{onOpenThread}
		{onOpenHashtag}
	/>
{/if}
