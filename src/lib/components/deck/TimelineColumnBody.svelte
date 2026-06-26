<script lang="ts">
	import { m } from '$lib/paraglide/messages.js';
	import type { Post } from '$lib/deck/types';
	import type { TimelineRuntime } from '$lib/deck/timeline-runtime';
	import type { FontSizeTextClasses } from '$lib/font-size';
	import type { ProfilePointer } from '$lib/nostr/nip19';
	import type { AvatarShape, PostActionVisibility } from '$lib/user-settings';
	import type { Profile } from '$lib/nostr/profiles';
	import TimelineEventCard from './TimelineEventCard.svelte';

	type Props = {
		runtime: TimelineRuntime;
		isLoggedIn: boolean;
		textClass: FontSizeTextClasses;
		avatarShape: AvatarShape;
		postActionVisibility: PostActionVisibility;
		scrollRoot?: HTMLDivElement;
		getProfile: (pubkey: string) => Profile | undefined;
		requestProfiles: (pubkeys: string[], relays: string[]) => void;
		profileRelays: string[];
		isMutedUser: (pubkey: string) => boolean;
		onMuteUser: (pubkey: string) => void;
		canLikePost: (post: Post) => boolean;
		isLikePostLiked: (post: Post) => boolean;
		isLikePostPublishing: (post: Post) => boolean;
		onLikePost: (post: Post) => void;
		onLoadOlder: () => void;
		onLoadNewer: () => void;
		onOpenProfile: (profile: ProfilePointer) => void;
		onOpenThread: (post: Post) => void;
		onOpenHashtag: (hashtag: string) => void;
	};

	const {
		runtime,
		isLoggedIn,
		textClass,
		avatarShape,
		postActionVisibility,
		scrollRoot,
		getProfile,
		requestProfiles,
		profileRelays,
		isMutedUser,
		onMuteUser,
		canLikePost,
		isLikePostLiked,
		isLikePostPublishing,
		onLikePost,
		onLoadOlder,
		onLoadNewer,
		onOpenProfile,
		onOpenThread,
		onOpenHashtag
	}: Props = $props();
	let newerSentinel: HTMLDivElement | undefined = $state();
	let olderSentinel: HTMLDivElement | undefined = $state();

	function getEvent(eventId: string) {
		return runtime.loadedEventsById[eventId];
	}

	function isReferenceUnavailable(eventId: string) {
		return runtime.unavailableReferenceEventIds.includes(eventId);
	}

	$effect(() => {
		if (!scrollRoot) return;

		const observer = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) {
					if (!entry.isIntersecting) continue;

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

		if (newerSentinel) observer.observe(newerSentinel);
		if (olderSentinel) observer.observe(olderSentinel);

		return () => observer.disconnect();
	});
</script>

{#if runtime.error}
	<div
		class={[
			'flex h-full items-center justify-center p-6 text-center font-semibold text-rose-600 dark:text-rose-400',
			textClass.control
		]}
	>
		{m.custom_timeline_error({ message: runtime.error })}
	</div>
{:else if runtime.isLoading && runtime.visibleEventIds.length === 0}
	<div
		class={[
			'flex h-full items-center justify-center p-6 text-center text-slate-500 dark:text-slate-400',
			textClass.control
		]}
	>
		{m.custom_timeline_loading()}
	</div>
{:else if runtime.visibleEventIds.length === 0}
	<div
		class={[
			'flex h-full items-center justify-center p-6 text-center text-slate-500 dark:text-slate-400',
			textClass.control
		]}
	>
		{m.custom_timeline_empty()}
	</div>
{:else}
	<div bind:this={newerSentinel} class="h-px" aria-hidden="true"></div>
	{#each runtime.visibleEventIds as eventId (eventId)}
		<TimelineEventCard
			{eventId}
			{getEvent}
			{isReferenceUnavailable}
			{isLoggedIn}
			{textClass}
			{avatarShape}
			{postActionVisibility}
			{getProfile}
			{requestProfiles}
			{profileRelays}
			{isMutedUser}
			{onMuteUser}
			{canLikePost}
			{isLikePostLiked}
			{isLikePostPublishing}
			{onLikePost}
			{onOpenProfile}
			{onOpenThread}
			{onOpenHashtag}
		/>
	{/each}
	<div bind:this={olderSentinel} class="h-px" aria-hidden="true"></div>
{/if}
