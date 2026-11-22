<script lang="ts">
	import { m } from '$lib/paraglide/messages.js';
	import type { Post } from '$lib/features/posts/types';
	import type { SharePostResult } from '$lib/features/posts/application/post-share-controller.svelte';
	import type { TimelineRuntime } from '$lib/deck/timeline-runtime';
	import type { FontSizeTextClasses } from '$lib/font-size';
	import type {
		CustomEmojiReactionCandidate,
		EmojiReaction,
		LikeReaction
	} from '$lib/nostr/emoji-reactions';
	import type { ProfilePointer } from '$lib/nostr/nip19';
	import type { AvatarShape, PostActionVisibility } from '$lib/user-settings';
	import type { Profile } from '$lib/nostr/profiles';
	import type { Locale } from '$lib/paraglide/runtime.js';
	import { getQuoteTags } from '$lib/nostr/posts';
	import type { TimelineColumnConfig } from '$lib/deck/types';
	import { classifyNotification } from '$lib/features/notifications/domain/notification-actions';
	import NotificationContext from '$lib/features/notifications/presentation/NotificationContext.svelte';
	import TimelineEventCard from './TimelineEventCard.svelte';

	type Props = {
		runtime: TimelineRuntime;
		column: TimelineColumnConfig;
		isColumnActive: boolean;
		isLoggedIn: boolean;
		textClass: FontSizeTextClasses;
		avatarShape: AvatarShape;
		postActionVisibility: PostActionVisibility;
		likeReaction: LikeReaction;
		appLocale: Locale;
		emojiReactionCandidates: CustomEmojiReactionCandidate[];
		scrollRoot?: HTMLDivElement;
		getProfile: (pubkey: string) => Profile | undefined;
		requestProfiles: (pubkeys: string[], relays: string[]) => void;
		profileRelays: string[];
		isMutedUser: (pubkey: string) => boolean;
		onMuteUser: (pubkey: string) => void;
		canReplyPost: (post: Post) => boolean;
		onReplyPost: (post: Post) => void;
		canLikePost: (post: Post) => boolean;
		isLikePostLiked: (post: Post) => boolean;
		isLikePostPublishing: (post: Post) => boolean;
		onLikePost: (post: Post) => void;
		canRepostPost: (post: Post) => boolean;
		isRepostPostReposted: (post: Post) => boolean;
		isRepostPostPublishing: (post: Post) => boolean;
		onRepostPost: (post: Post) => void;
		canQuotePost: (post: Post) => boolean;
		onQuotePost: (post: Post) => void;
		canReactWithEmojiPost: (post: Post) => boolean;
		isEmojiReactionPostPublishing: (post: Post) => boolean;
		onReactWithEmojiPost: (post: Post, reaction: EmojiReaction) => void;
		canSharePost: (post: Post) => boolean;
		onSharePost: (post: Post) => Promise<SharePostResult> | SharePostResult;
		onLoadOlder: () => void;
		onLoadNewer: () => void;
		onOpenProfile: (profile: ProfilePointer) => void;
		onOpenThread: (post: Post) => void;
		onOpenHashtag: (hashtag: string) => void;
	};

	const {
		runtime,
		column,
		isColumnActive,
		isLoggedIn,
		textClass,
		avatarShape,
		postActionVisibility,
		likeReaction,
		appLocale,
		emojiReactionCandidates,
		scrollRoot,
		getProfile,
		requestProfiles,
		profileRelays,
		isMutedUser,
		onMuteUser,
		canReplyPost,
		onReplyPost,
		canLikePost,
		isLikePostLiked,
		isLikePostPublishing,
		onLikePost,
		canRepostPost,
		isRepostPostReposted,
		isRepostPostPublishing,
		onRepostPost,
		canQuotePost,
		onQuotePost,
		canReactWithEmojiPost,
		isEmojiReactionPostPublishing,
		onReactWithEmojiPost,
		canSharePost,
		onSharePost,
		onLoadOlder,
		onLoadNewer,
		onOpenProfile,
		onOpenThread,
		onOpenHashtag
	}: Props = $props();
	let newerSentinel: HTMLDivElement | undefined = $state();
	let olderSentinel: HTMLDivElement | undefined = $state();

	const notificationsColumn = $derived(
		column.timelineKind === 'preset' && column.sourceKey === 'nav_notifications' ? column : null
	);
	const entries = $derived.by(() => {
		if (!notificationsColumn) {
			return runtime.visibleEventIds.map((eventId) => ({ eventId, notification: null }));
		}

		const { pubkey, includeOwnEvents } = notificationsColumn;
		return runtime.visibleEventIds.flatMap((eventId) => {
			const event = getEvent(eventId);
			if (!event) {
				return [];
			}
			const notification = classifyNotification(event, pubkey, includeOwnEvents, getEvent);
			return notification.types.length > 0 ? [{ eventId, notification }] : [];
		});
	});

	function getEvent(eventId: string) {
		return runtime.loadedEventsById[eventId];
	}

	function isReferenceUnavailable(eventId: string) {
		return runtime.unavailableReferenceEventIds.includes(eventId);
	}

	$effect(() => {
		if (!scrollRoot) {
			return;
		}

		const observer = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) {
					if (!entry.isIntersecting) {
						continue;
					}

					if (entry.target === newerSentinel && runtime.hasNewerStored && !runtime.isLoadingNewer) {
						onLoadNewer();
					}
					if (entry.target === olderSentinel && runtime.hasOlderStored && !runtime.isLoadingOlder) {
						onLoadOlder();
					}
				}
			},
			{ root: scrollRoot, rootMargin: '8px 0px' }
		);

		if (newerSentinel) {
			observer.observe(newerSentinel);
		}
		if (olderSentinel) {
			observer.observe(olderSentinel);
		}

		return () => observer.disconnect();
	});
</script>

{#if runtime.error && (!notificationsColumn || entries.length === 0)}
	<div
		class={[
			'flex h-full items-center justify-center p-6 text-center font-semibold text-rose-600 dark:text-rose-400',
			textClass.control
		]}
	>
		{m.custom_timeline_error({ message: runtime.error })}
	</div>
{:else if runtime.isLoading && entries.length === 0}
	<div
		class={[
			'flex h-full items-center justify-center p-6 text-center text-slate-500 dark:text-slate-400',
			textClass.control
		]}
	>
		{m.custom_timeline_loading()}
	</div>
{:else if entries.length === 0}
	<div
		class={[
			'flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-slate-500 dark:text-slate-400',
			textClass.control
		]}
	>
		{m.custom_timeline_empty()}
		{#if notificationsColumn && runtime.hasNewerStored}
			<button
				type="button"
				class="underline"
				onclick={onLoadNewer}
				disabled={runtime.isLoadingNewer}
			>
				{m.notifications_load_newer()}
			</button>
		{/if}
		{#if notificationsColumn && runtime.hasOlderStored}
			<button
				type="button"
				class="underline"
				onclick={onLoadOlder}
				disabled={runtime.isLoadingOlder}
			>
				{m.notifications_load_older()}
			</button>
		{/if}
	</div>
{:else}
	<div bind:this={newerSentinel} class="h-px" aria-hidden="true"></div>
	{#each entries as { eventId, notification } (eventId)}
		<TimelineEventCard
			{eventId}
			{getEvent}
			{isReferenceUnavailable}
			getQuoteReferenceState={notification
				? (id) => {
						const source = getEvent(eventId);
						if (!source || !getQuoteTags(source).some((tag) => tag[1] === id)) {
							return undefined;
						}
						const event = getEvent(id);
						return event
							? { status: 'loaded', event }
							: { status: isReferenceUnavailable(eventId) ? 'unavailable' : 'loading' };
					}
				: undefined}
			{isColumnActive}
			{scrollRoot}
			{isLoggedIn}
			{textClass}
			{avatarShape}
			{postActionVisibility}
			{likeReaction}
			{appLocale}
			{emojiReactionCandidates}
			{getProfile}
			{requestProfiles}
			{profileRelays}
			{isMutedUser}
			{onMuteUser}
			{canReplyPost}
			{onReplyPost}
			{canLikePost}
			{isLikePostLiked}
			{isLikePostPublishing}
			{onLikePost}
			{canRepostPost}
			{isRepostPostReposted}
			{isRepostPostPublishing}
			{onRepostPost}
			{canQuotePost}
			{onQuotePost}
			{canReactWithEmojiPost}
			{isEmojiReactionPostPublishing}
			{onReactWithEmojiPost}
			{canSharePost}
			{onSharePost}
			{onOpenProfile}
			{onOpenThread}
			{onOpenHashtag}
		>
			{#snippet context(event)}
				{#if notification}
					<NotificationContext
						{event}
						{notification}
						{getEvent}
						{isReferenceUnavailable}
						{textClass}
						{avatarShape}
						{getProfile}
						{isMutedUser}
						{onOpenThread}
					/>
				{/if}
			{/snippet}
		</TimelineEventCard>
	{/each}
	<div bind:this={olderSentinel} class="h-px" aria-hidden="true"></div>
{/if}
