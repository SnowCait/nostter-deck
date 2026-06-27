<script lang="ts">
	import { MessageCircle, X } from '@lucide/svelte';
	import { m } from '$lib/paraglide/messages.js';
	import type { Post, ThreadPost } from '$lib/deck/types';
	import type { FontSizeTextClasses } from '$lib/font-size';
	import type { CustomEmojiReactionCandidate, EmojiReaction } from '$lib/nostr/emoji-reactions';
	import type { ProfilePointer } from '$lib/nostr/nip19';
	import type { AvatarShape, PostActionVisibility } from '$lib/user-settings';
	import type { Profile } from '$lib/nostr/profiles';
	import type { Locale } from '$lib/paraglide/runtime.js';
	import PostCard from './PostCard.svelte';

	type Props = {
		id: string;
		posts: ThreadPost[];
		isSingleColumn?: boolean;
		isLoading: boolean;
		error: string | null;
		isLoggedIn: boolean;
		textClass: FontSizeTextClasses;
		avatarShape: AvatarShape;
		postActionVisibility: PostActionVisibility;
		appLocale: Locale;
		emojiReactionCandidates: CustomEmojiReactionCandidate[];
		getProfile: (pubkey: string) => Profile | undefined;
		requestProfiles: (pubkeys: string[], relays: string[]) => void;
		profileRelays: string[];
		isMutedUser: (pubkey: string) => boolean;
		onMuteUser: (pubkey: string) => void;
		canLikePost: (post: Post) => boolean;
		isLikePostLiked: (post: Post) => boolean;
		isLikePostPublishing: (post: Post) => boolean;
		onLikePost: (post: Post) => void;
		canReactWithEmojiPost: (post: Post) => boolean;
		isEmojiReactionPostPublishing: (post: Post) => boolean;
		onReactWithEmojiPost: (post: Post, reaction: EmojiReaction) => void;
		onClose: () => void;
		onOpenProfile: (profile: ProfilePointer) => void;
		onOpenThread: (post: Post) => void;
		onOpenHashtag: (hashtag: string) => void;
	};

	let {
		id,
		posts,
		isSingleColumn = false,
		isLoading,
		error,
		isLoggedIn,
		textClass,
		avatarShape,
		postActionVisibility,
		appLocale,
		emojiReactionCandidates,
		getProfile,
		requestProfiles,
		profileRelays,
		isMutedUser,
		onMuteUser,
		canLikePost,
		isLikePostLiked,
		isLikePostPublishing,
		onLikePost,
		canReactWithEmojiPost,
		isEmojiReactionPostPublishing,
		onReactWithEmojiPost,
		onClose,
		onOpenProfile,
		onOpenThread,
		onOpenHashtag
	}: Props = $props();
</script>

<section
	{id}
	data-deck-column
	data-column-id="thread"
	tabindex="-1"
	class={[
		'flex h-full flex-col overflow-hidden border-r border-slate-200 bg-white outline-none dark:border-slate-800 dark:bg-slate-950',
		isSingleColumn ? 'w-full' : 'w-[342px]'
	]}
	data-testid="thread-column"
>
	<header
		class="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 px-3 py-2.5 dark:border-slate-800"
	>
		<div class="flex min-w-0 items-center gap-2">
			<MessageCircle
				class="size-4 shrink-0 text-slate-500 dark:text-slate-400"
				aria-hidden="true"
			/>
			<h2 class={['truncate font-bold', textClass.title]}>{m.thread()}</h2>
		</div>
		<button
			type="button"
			class="flex size-8 items-center justify-center rounded-md text-slate-500 transition hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
			title={m.close()}
			aria-label={m.close()}
			onclick={onClose}
		>
			<X class="size-4" aria-hidden="true" />
		</button>
	</header>
	<div class="min-h-0 flex-1 overflow-y-auto">
		{#if error}
			<div
				class={[
					'flex h-full items-center justify-center p-6 text-center text-rose-600',
					textClass.control
				]}
			>
				{m.thread_error({ message: error })}
			</div>
		{:else if isLoading}
			<div
				class={['flex h-full items-center justify-center p-6 text-slate-500', textClass.control]}
			>
				{m.thread_loading()}
			</div>
		{:else if posts.length === 0}
			<div
				class={['flex h-full items-center justify-center p-6 text-slate-500', textClass.control]}
			>
				{m.thread_empty()}
			</div>
		{:else}
			{#each posts as item (item.post.id)}
				<div
					style={`padding-left: ${Math.min(item.depth, 4) * 0.75}rem`}
					data-thread-depth={item.depth}
				>
					<PostCard
						post={item.post}
						{isLoggedIn}
						{textClass}
						{avatarShape}
						{postActionVisibility}
						{appLocale}
						{emojiReactionCandidates}
						{getProfile}
						{requestProfiles}
						{profileRelays}
						isMuted={item.isMuted}
						{isMutedUser}
						{onMuteUser}
						{canLikePost}
						{isLikePostLiked}
						{isLikePostPublishing}
						{onLikePost}
						{canReactWithEmojiPost}
						{isEmojiReactionPostPublishing}
						{onReactWithEmojiPost}
						{onOpenProfile}
						{onOpenThread}
						{onOpenHashtag}
					/>
				</div>
			{/each}
		{/if}
	</div>
</section>
