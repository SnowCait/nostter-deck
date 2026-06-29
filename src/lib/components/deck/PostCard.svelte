<script lang="ts">
	import { Heart, MessageCircle, Repeat2, Share, ShieldCheck } from '@lucide/svelte';
	import { m } from '$lib/paraglide/messages.js';
	import type { Post, PostMessage } from '$lib/deck/types';
	import type { FontSizeTextClasses } from '$lib/font-size';
	import type { CustomEmojiReactionCandidate, EmojiReaction } from '$lib/nostr/emoji-reactions';
	import type { ProfilePointer } from '$lib/nostr/nip19';
	import type { Profile } from '$lib/nostr/profiles';
	import type { Locale } from '$lib/paraglide/runtime.js';
	import type { AvatarShape, PostActionVisibility } from '$lib/user-settings';
	import CustomEmojiText from './CustomEmojiText.svelte';
	import EmojiReactionPicker from './EmojiReactionPicker.svelte';
	import ProfileAvatar from './ProfileAvatar.svelte';
	import MutedContentPlaceholder from './MutedContentPlaceholder.svelte';
	import ContentWarningPlaceholder from './ContentWarningPlaceholder.svelte';
	import EventJsonMenu from './EventJsonMenu.svelte';
	import PostCardBody from './PostCardBody.svelte';
	import PostCardContextList from './PostCardContextList.svelte';

	type Props = {
		post: Post;
		isLoggedIn: boolean;
		textClass: FontSizeTextClasses;
		avatarShape: AvatarShape;
		postActionVisibility: PostActionVisibility;
		appLocale: Locale;
		emojiReactionCandidates: CustomEmojiReactionCandidate[];
		getProfile: (pubkey: string) => Profile | undefined;
		requestProfiles: (pubkeys: string[], relays: string[]) => void;
		profileRelays: string[];
		isMuted?: boolean;
		isMutedUser?: (pubkey: string) => boolean;
		onMuteUser?: (pubkey: string) => void;
		canLikePost?: (post: Post) => boolean;
		isLikePostLiked?: (post: Post) => boolean;
		isLikePostPublishing?: (post: Post) => boolean;
		onLikePost?: (post: Post) => void;
		canRepostPost?: (post: Post) => boolean;
		isRepostPostReposted?: (post: Post) => boolean;
		isRepostPostPublishing?: (post: Post) => boolean;
		onRepostPost?: (post: Post) => void;
		canReactWithEmojiPost?: (post: Post) => boolean;
		isEmojiReactionPostPublishing?: (post: Post) => boolean;
		onReactWithEmojiPost?: (post: Post, reaction: EmojiReaction) => void;
		onOpenProfile?: (profile: ProfilePointer) => void;
		onOpenThread?: (post: Post) => void;
		onOpenHashtag?: (hashtag: string) => void;
	};

	const {
		post,
		isLoggedIn,
		textClass,
		avatarShape,
		postActionVisibility,
		appLocale,
		emojiReactionCandidates,
		getProfile,
		requestProfiles,
		profileRelays,
		isMuted = false,
		isMutedUser = () => false,
		onMuteUser,
		canLikePost = () => false,
		isLikePostLiked = () => false,
		isLikePostPublishing = () => false,
		onLikePost,
		canRepostPost = () => false,
		isRepostPostReposted = () => false,
		isRepostPostPublishing = () => false,
		onRepostPost,
		canReactWithEmojiPost = () => false,
		isEmojiReactionPostPublishing = () => false,
		onReactWithEmojiPost,
		onOpenProfile,
		onOpenThread,
		onOpenHashtag
	}: Props = $props();
	let isMutedPostRevealed = $state(false);
	let isSensitiveContentRevealed = $state(false);
	const isPostVisible = $derived(!isMuted || isMutedPostRevealed);
	const isPostContentVisible = $derived(!post.contentWarning || isSensitiveContentRevealed);
	const postActionSlotClass = $derived(
		postActionVisibility === 'always'
			? 'post-actions-slot post-actions-visible'
			: 'post-actions-slot post-actions-on-interaction'
	);
	const postActionListClass =
		'absolute -top-2.5 left-0 flex h-7 gap-1 text-slate-500 transition-opacity duration-150 dark:text-slate-400';
	const postActionButtonClass =
		'flex size-7 items-center justify-center rounded-md transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:bg-transparent disabled:hover:text-slate-500 dark:hover:bg-slate-800 disabled:dark:hover:bg-transparent disabled:dark:hover:text-slate-400';
	const likeButtonClass = $derived([
		postActionButtonClass,
		isLikePostLiked(post)
			? 'text-rose-500 disabled:opacity-100 disabled:hover:text-rose-500 dark:text-rose-400 disabled:dark:hover:text-rose-400'
			: ''
	]);
	const repostButtonClass = $derived([
		postActionButtonClass,
		isRepostPostReposted(post)
			? 'text-emerald-600 disabled:opacity-100 disabled:hover:text-emerald-600 dark:text-emerald-400 disabled:dark:hover:text-emerald-400'
			: ''
	]);
	const isLikeDisabled = $derived(!onLikePost || !canLikePost(post));
	const isRepostDisabled = $derived(!onRepostPost || !canRepostPost(post));
	const isEmojiReactionDisabled = $derived(!onReactWithEmojiPost || !canReactWithEmojiPost(post));
	const keyboardNavigationKey = $derived(
		post.id ?? `${post.pubkey}:${post.time}:${post.body.slice(0, 80)}`
	);

	function openPostAuthorProfile() {
		onOpenProfile?.({ pubkey: post.pubkey, relays: [] });
	}

	function mutePostAuthor() {
		onMuteUser?.(post.pubkey);
	}

	function likePost() {
		onLikePost?.(post);
	}

	function repostPost() {
		onRepostPost?.(post);
	}

	function reactWithEmoji(reaction: EmojiReaction) {
		onReactWithEmojiPost?.(post, reaction);
	}

	function formatPostMessage(message: PostMessage) {
		switch (message.key) {
			case 'replying_to':
				return m.replying_to();
			case 'reposted_by':
				return m.reposted_by(message.params);
			case 'reposted_event_unavailable':
				return m.reposted_event_unavailable();
			case 'reacted_by_like':
				return m.reacted_by_like(message.params);
			case 'reacted_by':
				return m.reacted_by(message.params);
			case 'reaction_event_unavailable':
				return m.reaction_event_unavailable();
		}
	}
</script>

<div
	data-deck-post
	data-post-key={keyboardNavigationKey}
	tabindex="-1"
	aria-keyshortcuts="H J K L ArrowLeft ArrowDown ArrowUp ArrowRight Enter P"
	class="outline-none [&:focus-visible>*]:bg-slate-100 dark:[&:focus-visible>*]:bg-slate-900"
>
	{#if !isPostVisible}
		<div class="relative">
			<MutedContentPlaceholder
				message={m.muted_post()}
				actionLabel={m.show_muted_post()}
				{textClass}
				testId="muted-post"
				onReveal={() => (isMutedPostRevealed = true)}
			/>
			<EventJsonMenu
				sourceEvent={post.events.source}
				referencedEvent={post.events.referenced}
				{textClass}
				muteLabel={m.mute_user({ name: post.author })}
				onMute={mutePostAuthor}
				class="absolute top-3 right-3"
			/>
		</div>
	{:else if post.referenceStatus === 'loading'}
		<div
			data-testid="referenced-post-loading"
			class={[
				'relative flex min-h-20 items-center border-b border-slate-200 bg-slate-50/70 p-3 pr-12 text-slate-500 dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-400',
				textClass.body
			]}
		>
			{m.referenced_post_loading()}
			<EventJsonMenu
				sourceEvent={post.events.source}
				referencedEvent={post.events.referenced}
				{textClass}
				muteLabel={m.mute_user({ name: post.author })}
				onMute={mutePostAuthor}
				class="absolute top-3 right-3"
			/>
		</div>
	{:else}
		<article
			class="post-card relative border-b border-slate-200 p-3 transition hover:bg-slate-50/80 dark:border-slate-800 dark:hover:bg-slate-900/80"
		>
			<PostCardContextList contexts={post.contexts} {post} {textClass} {onOpenThread} />

			<div class="flex gap-3">
				<button
					type="button"
					data-keyboard-open-profile
					class="h-fit shrink-0 rounded-full focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 focus-visible:outline-none dark:focus-visible:ring-offset-slate-950"
					title={m.open_profile({ name: post.author })}
					aria-label={m.open_profile({ name: post.author })}
					onclick={openPostAuthorProfile}
				>
					<ProfileAvatar
						shape={avatarShape}
						sizeClass="size-10"
						imageUrl={post.avatarUrl}
						fallbackText={post.author.slice(0, 1)}
						fallbackClass={`${post.accent} text-sm font-bold text-white`}
						testId="post-avatar"
					/>
				</button>
				<div class="min-w-0 flex-1">
					<div class="flex items-start justify-between gap-2">
						<div class="min-w-0">
							<div class="flex min-w-0 items-center gap-1.5">
								<button
									type="button"
									data-keyboard-open-profile
									class={[
										'truncate rounded-sm text-left font-bold hover:underline focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:outline-none',
										textClass.account
									]}
									title={m.open_profile({ name: post.author })}
									aria-label={m.open_profile({ name: post.author })}
									onclick={openPostAuthorProfile}
								>
									<CustomEmojiText text={post.author} customEmojis={post.authorEmojis} />
								</button>
								{#if post.verified ?? true}
									<ShieldCheck class="size-4 shrink-0 text-sky-500" aria-label={m.verified()} />
								{/if}
								<span class={['shrink-0 text-slate-500 dark:text-slate-400', textClass.meta]}>
									· {post.time}
								</span>
							</div>
						</div>
						<EventJsonMenu
							sourceEvent={post.events.source}
							referencedEvent={post.events.referenced}
							{textClass}
							muteLabel={m.mute_user({ name: post.author })}
							onMute={mutePostAuthor}
						/>
					</div>

					{#if post.unavailableMessage}
						<p class={['mt-2 text-slate-500 dark:text-slate-400', textClass.body]}>
							{formatPostMessage(post.unavailableMessage)}
						</p>
					{:else if !isPostContentVisible}
						<ContentWarningPlaceholder
							reason={post.contentWarning?.reason}
							{textClass}
							testId="content-warning"
							class="mt-2"
							onReveal={() => (isSensitiveContentRevealed = true)}
						/>
					{:else}
						<PostCardBody
							{post}
							{textClass}
							{avatarShape}
							{getProfile}
							{requestProfiles}
							{profileRelays}
							{isMutedUser}
							{onOpenProfile}
							{onOpenThread}
							{onOpenHashtag}
						/>
					{/if}
					{#if isLoggedIn}
						<div class={postActionSlotClass}>
							<div class={postActionListClass}>
								<button
									type="button"
									disabled
									class={postActionButtonClass}
									title={m.reply()}
									aria-label={m.reply()}
								>
									<MessageCircle class="size-4" aria-hidden="true" />
								</button>
								<button
									type="button"
									disabled={isRepostDisabled}
									class={repostButtonClass}
									title={m.repost()}
									aria-label={m.repost()}
									aria-pressed={isRepostPostReposted(post)}
									aria-busy={isRepostPostPublishing(post)}
									onclick={repostPost}
								>
									<Repeat2
										class={['size-4', isRepostPostReposted(post) ? 'stroke-[2.5]' : '']}
										aria-hidden="true"
									/>
								</button>
								<button
									type="button"
									disabled={isLikeDisabled}
									class={likeButtonClass}
									title={m.like()}
									aria-label={m.like()}
									aria-pressed={isLikePostLiked(post)}
									aria-busy={isLikePostPublishing(post)}
									onclick={likePost}
								>
									<Heart
										class={['size-4', isLikePostLiked(post) ? 'fill-current' : '']}
										aria-hidden="true"
									/>
								</button>
								<EmojiReactionPicker
									customEmojis={emojiReactionCandidates}
									locale={appLocale}
									disabled={isEmojiReactionDisabled}
									isPublishing={isEmojiReactionPostPublishing(post)}
									buttonClass={postActionButtonClass}
									onSelect={reactWithEmoji}
								/>
								<button
									type="button"
									disabled
									class={postActionButtonClass}
									title={m.share()}
									aria-label={m.share()}
								>
									<Share class="size-4" aria-hidden="true" />
								</button>
							</div>
						</div>
					{/if}
				</div>
			</div>
		</article>
	{/if}
</div>

<style>
	.post-card {
		z-index: 0;
	}

	.post-card:hover,
	.post-card:focus-within,
	:global([data-deck-post]:focus-visible) .post-card {
		z-index: 10;
	}

	.post-actions-slot {
		position: relative;
		height: 0.5rem;
		margin-top: 0.625rem;
		overflow: visible;
		opacity: 1;
		pointer-events: auto;
	}

	.post-actions-on-interaction {
		opacity: 1;
		pointer-events: auto;
		transition: opacity 150ms ease;
	}

	@media (hover: hover) and (pointer: fine) {
		.post-card .post-actions-on-interaction {
			opacity: 0;
			pointer-events: none;
		}

		.post-card:hover .post-actions-on-interaction,
		.post-card:focus-within .post-actions-on-interaction,
		:global([data-deck-post]:focus-visible) .post-actions-on-interaction {
			opacity: 1;
			pointer-events: auto;
		}
	}
</style>
