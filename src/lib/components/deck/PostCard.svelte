<script lang="ts">
	import { Heart, MessageCircle, Repeat2, Share, ShieldCheck } from '@lucide/svelte';
	import { m } from '$lib/paraglide/messages.js';
	import type { Post, PostMessage } from '$lib/deck/types';
	import type { FontSizeTextClasses } from '$lib/font-size';
	import type { ProfilePointer } from '$lib/nostr/nip19';
	import type { Profile } from '$lib/nostr/profiles';
	import type { AvatarShape } from '$lib/user-settings';
	import CustomEmojiText from './CustomEmojiText.svelte';
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
		getProfile: (pubkey: string) => Profile | undefined;
		requestProfiles: (pubkeys: string[], relays: string[]) => void;
		profileRelays: string[];
		isMuted?: boolean;
		isMutedUser?: (pubkey: string) => boolean;
		onMuteUser?: (pubkey: string) => void;
		onOpenProfile?: (profile: ProfilePointer) => void;
		onOpenThread?: (post: Post) => void;
		onOpenHashtag?: (hashtag: string) => void;
	};

	const {
		post,
		isLoggedIn,
		textClass,
		avatarShape,
		getProfile,
		requestProfiles,
		profileRelays,
		isMuted = false,
		isMutedUser = () => false,
		onMuteUser,
		onOpenProfile,
		onOpenThread,
		onOpenHashtag
	}: Props = $props();
	let isMutedPostRevealed = $state(false);
	let isSensitiveContentRevealed = $state(false);
	// Keep the controls hidden until their actions are implemented.
	const arePostActionsEnabled = false;
	const isPostVisible = $derived(!isMuted || isMutedPostRevealed);
	const isPostContentVisible = $derived(!post.contentWarning || isSensitiveContentRevealed);
	const keyboardNavigationKey = $derived(
		post.id ?? `${post.pubkey}:${post.time}:${post.body.slice(0, 80)}`
	);

	function openPostAuthorProfile() {
		onOpenProfile?.({ pubkey: post.pubkey, relays: [] });
	}

	function mutePostAuthor() {
		onMuteUser?.(post.pubkey);
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
			class="border-b border-slate-200 p-3 transition hover:bg-slate-50/80 dark:border-slate-800 dark:hover:bg-slate-900/80"
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
					{#if isLoggedIn && arePostActionsEnabled}
						<div class="mt-3 grid grid-cols-4 text-slate-500 dark:text-slate-400">
							<button
								type="button"
								class={[
									'flex h-8 items-center gap-1 rounded-md transition hover:bg-sky-50 hover:text-sky-600 dark:hover:bg-sky-950/40 dark:hover:text-sky-300',
									textClass.action
								]}
								title={m.reply()}
								aria-label={m.reply()}
							>
								<MessageCircle class="size-4" aria-hidden="true" />
								<span>{post.stats.replies}</span>
							</button>
							<button
								type="button"
								class={[
									'flex h-8 items-center gap-1 rounded-md transition hover:bg-emerald-50 hover:text-emerald-600 dark:hover:bg-emerald-950/40 dark:hover:text-emerald-300',
									textClass.action
								]}
								title={m.repost()}
								aria-label={m.repost()}
							>
								<Repeat2 class="size-4" aria-hidden="true" />
								<span>{post.stats.reposts}</span>
							</button>
							<button
								type="button"
								class={[
									'flex h-8 items-center gap-1 rounded-md transition hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40 dark:hover:text-rose-300',
									textClass.action
								]}
								title={m.like()}
								aria-label={m.like()}
							>
								<Heart class="size-4" aria-hidden="true" />
								<span>{post.stats.likes}</span>
							</button>
							<button
								type="button"
								class="flex h-8 items-center justify-center rounded-md transition hover:bg-slate-100 hover:text-slate-800 dark:hover:bg-slate-800 dark:hover:text-slate-100"
								title={m.share()}
								aria-label={m.share()}
							>
								<Share class="size-4" aria-hidden="true" />
							</button>
						</div>
					{/if}
				</div>
			</div>
		</article>
	{/if}
</div>
