<script lang="ts">
	import { m } from '$lib/paraglide/messages.js';
	import type { TimelineColumn } from '$lib/deck/types';
	import type { FontSizeTextClasses } from '$lib/font-size';
	import type { ProfilePointer } from '$lib/nostr/nip19';
	import type { AvatarShape } from '$lib/user-settings';
	import type * as Nostr from 'nostr-typedef';
	import PostCard from './PostCard.svelte';

	type Props = {
		column: TimelineColumn;
		isLoggedIn: boolean;
		textClass: FontSizeTextClasses;
		avatarShape: AvatarShape;
		scrollRoot?: HTMLDivElement;
		getProfile: (pubkey: string) => Nostr.Content.Metadata | undefined;
		requestProfiles: (pubkeys: string[], relays: string[]) => void;
		profileRelays: string[];
		onLoadOlder: () => void;
		onLoadNewer: () => void;
		onOpenProfile: (profile: ProfilePointer) => void;
		onOpenThread: (post: import('$lib/deck/types').Post) => void;
	};

	const {
		column,
		isLoggedIn,
		textClass,
		avatarShape,
		scrollRoot,
		getProfile,
		requestProfiles,
		profileRelays,
		onLoadOlder,
		onLoadNewer,
		onOpenProfile,
		onOpenThread
	}: Props = $props();
	let newerSentinel: HTMLDivElement | undefined = $state();
	let olderSentinel: HTMLDivElement | undefined = $state();

	$effect(() => {
		if (!scrollRoot) return;

		const observer = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) {
					if (!entry.isIntersecting) continue;

					if (entry.target === newerSentinel && column.hasNewerStored && !column.isLoadingNewer) {
						onLoadNewer();
					}
					if (entry.target === olderSentinel && column.hasOlderStored && !column.isLoadingOlder) {
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

{#if column.error}
	<div
		class={[
			'flex h-full items-center justify-center p-6 text-center font-semibold text-rose-600 dark:text-rose-400',
			textClass.control
		]}
	>
		{m.custom_timeline_error({ message: column.error })}
	</div>
{:else if column.isLoading && column.posts.length === 0}
	<div
		class={[
			'flex h-full items-center justify-center p-6 text-center text-slate-500 dark:text-slate-400',
			textClass.control
		]}
	>
		{m.custom_timeline_loading()}
	</div>
{:else if column.posts.length === 0}
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
	{#each column.posts as post (post.id ?? `${column.id}-${post.author}-${post.time}`)}
		<PostCard
			{post}
			{isLoggedIn}
			{textClass}
			{avatarShape}
			{getProfile}
			{requestProfiles}
			{profileRelays}
			{onOpenProfile}
			{onOpenThread}
		/>
	{/each}
	<div bind:this={olderSentinel} class="h-px" aria-hidden="true"></div>
{/if}
