<script lang="ts">
	import { Heart, MessageCircle, Ellipsis, Repeat2, Share, ShieldCheck } from '@lucide/svelte';
	import { npubEncode } from 'nostr-tools/nip19';
	import { linkifyPostContent, type PostContentToken } from '$lib/deck/post-content-links';
	import {
		clearUrlPreviewImage,
		getUrlMediaMetadata,
		requestUrlMediaMetadata,
		setUrlImageDimensions,
		type UrlMediaMetadata
	} from '$lib/deck/url-media';
	import { m } from '$lib/paraglide/messages.js';
	import type { Post, PostMessage } from '$lib/deck/types';
	import type { FontSizeTextClasses } from '$lib/font-size';
	import type { AvatarShape } from '$lib/user-settings';
	import type * as Nostr from 'nostr-typedef';
	import ProfileAvatar from './ProfileAvatar.svelte';

	type Props = {
		post: Post;
		isLoggedIn: boolean;
		textClass: FontSizeTextClasses;
		avatarShape: AvatarShape;
		getProfile: (pubkey: string) => Nostr.Content.Metadata | undefined;
		requestProfiles: (pubkeys: string[], relays: string[]) => void;
		profileRelays: string[];
	};

	const {
		post,
		isLoggedIn,
		textClass,
		avatarShape,
		getProfile,
		requestProfiles,
		profileRelays
	}: Props = $props();
	const bodyTokens = $derived(linkifyPostContent(post.body));
	let isBodyExpanded = $state(false);
	const isBodyCollapsible = $derived(post.body.length > 500 || post.body.split('\n').length > 12);

	$effect(() => {
		requestUrlMediaMetadata([
			...new Set(bodyTokens.flatMap((token) => (token.type === 'link' ? [token.href] : [])))
		]);
	});

	$effect(() => {
		const profileReferenceTokens = bodyTokens.filter(isProfileReferenceToken);
		if (profileReferenceTokens.length === 0) return;

		requestProfiles(
			[...new Set(profileReferenceTokens.map((token) => token.pubkey))],
			[
				...new Set([
					...profileRelays,
					...profileReferenceTokens.flatMap((token) => token.relayHints ?? [])
				])
			]
		);
	});

	function isProfileReferenceToken(
		token: PostContentToken
	): token is Extract<PostContentToken, { type: 'nostrReference' }> & { pubkey: string } {
		return (
			token.type === 'nostrReference' &&
			(token.entityType === 'npub' || token.entityType === 'nprofile') &&
			typeof token.pubkey === 'string'
		);
	}

	function getNostrReferenceText(token: Extract<PostContentToken, { type: 'nostrReference' }>) {
		if (!isProfileReferenceToken(token)) return token.text;

		const profile = getProfile(token.pubkey);
		const displayName = profile?.display_name ?? profile?.name;
		return displayName ? `@${displayName}` : `@${npubEncode(token.pubkey).slice(0, 12)}`;
	}

	function getUrlHostname(url: string) {
		try {
			return new URL(url).hostname;
		} catch {
			return url;
		}
	}

	function getImagePreviewStyle(media: UrlMediaMetadata | undefined) {
		if (media?.status !== 'image' || !media.width || !media.height) return '';

		return `width: min(100%, ${(12 * media.width) / media.height}rem); aspect-ratio: ${media.width} / ${media.height}`;
	}

	function hasImageDimensions(media: UrlMediaMetadata | undefined) {
		return media?.status === 'image' && Boolean(media.width) && Boolean(media.height);
	}

	function getLinkPreviewTitle(media: UrlMediaMetadata | undefined, fallbackUrl: string) {
		return media?.status === 'link' && media.title ? media.title : getUrlHostname(fallbackUrl);
	}

	function shouldShowFallbackLinkUrl(media: UrlMediaMetadata | undefined) {
		return media?.status === 'link' && !media.title && !media.imageUrl;
	}

	function loadPreviewImage(event: Event, url: string) {
		const image = event.currentTarget as HTMLImageElement | null;
		if (!image) return;

		setUrlImageDimensions(url, image.naturalWidth, image.naturalHeight);
	}

	function handleLinkPreviewImageError(url: string) {
		clearUrlPreviewImage(url);
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

<article
	class="border-b border-slate-200 p-3 transition hover:bg-slate-50/80 dark:border-slate-800 dark:hover:bg-slate-900/80"
>
	{#if post.contexts}
		{#each post.contexts as context, index (`${context.icon}:${context.message.key}:${index}`)}
			<div
				class={[
					'mb-2 flex min-w-0 items-center gap-1.5 pl-[3.25rem] font-semibold text-slate-500 dark:text-slate-400',
					textClass.meta
				]}
			>
				{#if context.icon === 'repost'}
					<Repeat2 class="size-4 shrink-0" aria-hidden="true" />
				{:else if context.icon === 'heart'}
					<Heart class="size-4 shrink-0" aria-hidden="true" />
				{:else if context.icon === 'reply'}
					<MessageCircle class="size-4 shrink-0" aria-hidden="true" />
				{/if}
				<span class="truncate">{formatPostMessage(context.message)}</span>
			</div>
		{/each}
	{/if}

	<div class="flex gap-3">
		<ProfileAvatar
			shape={avatarShape}
			sizeClass="size-10"
			imageUrl={post.avatarUrl}
			fallbackText={post.author.slice(0, 1)}
			fallbackClass={`${post.accent} text-sm font-bold text-white`}
			testId="post-avatar"
		/>
		<div class="min-w-0 flex-1">
			<div class="flex items-start justify-between gap-2">
				<div class="min-w-0">
					<div class="flex min-w-0 items-center gap-1.5">
						<p class={['truncate font-bold', textClass.account]}>{post.author}</p>
						{#if post.verified ?? true}
							<ShieldCheck class="size-4 shrink-0 text-sky-500" aria-label={m.verified()} />
						{/if}
						<span class={['shrink-0 text-slate-500 dark:text-slate-400', textClass.meta]}>
							· {post.time}
						</span>
					</div>
				</div>
				{#if isLoggedIn}
					<button
						type="button"
						class="flex size-7 shrink-0 items-center justify-center rounded-md text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-slate-200"
						title={m.column_options()}
						aria-label={m.column_options()}
					>
						<Ellipsis class="size-4" aria-hidden="true" />
					</button>
				{/if}
			</div>

			{#if post.unavailableMessage}
				<p class={['mt-2 text-slate-500 dark:text-slate-400', textClass.body]}>
					{formatPostMessage(post.unavailableMessage)}
				</p>
			{:else}
				<div class="relative mt-2">
					<div
						data-testid="post-body"
						class={[
							'min-w-0 [overflow-wrap:anywhere] text-slate-800 dark:text-slate-200',
							isBodyCollapsible && !isBodyExpanded ? 'max-h-48 overflow-hidden' : '',
							textClass.body
						]}
					>
						{#each bodyTokens as token, index (index)}
							{#if token.type === 'link'}
								{@const media = getUrlMediaMetadata(token.href)}
								<a
									href={token.href}
									target="_blank"
									rel="external noopener noreferrer"
									data-testid="url-preview"
									style={getImagePreviewStyle(media)}
									class={[
										'my-2 flex overflow-hidden rounded-md border border-slate-200 bg-slate-50 text-slate-600 transition hover:border-slate-300 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-slate-700 dark:hover:bg-slate-800',
										hasImageDimensions(media) ? '' : 'h-48'
									]}
								>
									{#if media?.status === 'image'}
										<img
											src={media.url}
											alt={token.text}
											class="h-full w-full object-contain"
											loading="lazy"
											onload={(event) => loadPreviewImage(event, media.url)}
										/>
									{:else if media?.status === 'link'}
										<span class="flex min-w-0 flex-1 flex-col">
											{#if media.imageUrl}
												<img
													src={media.imageUrl}
													alt=""
													class="h-36 w-full shrink-0 object-cover"
													loading="lazy"
													onerror={() => handleLinkPreviewImageError(media.url)}
												/>
											{/if}
											<span
												class={[
													'flex min-h-0 flex-1 flex-col justify-center gap-2',
													media.imageUrl ? 'p-3' : 'p-4'
												]}
											>
												<span
													class={[
														'line-clamp-2 font-bold [overflow-wrap:anywhere] text-slate-800 dark:text-slate-100',
														textClass.account
													]}
												>
													{getLinkPreviewTitle(media, token.href)}
												</span>
												{#if shouldShowFallbackLinkUrl(media)}
													<span
														class={[
															'line-clamp-2 [overflow-wrap:anywhere] text-slate-500 dark:text-slate-400',
															textClass.meta
														]}
													>
														{token.href}
													</span>
												{/if}
											</span>
										</span>
									{:else}
										<span class="flex w-full flex-col justify-center gap-3 p-4" aria-hidden="true">
											<span class="h-4 w-1/3 rounded bg-slate-200 dark:bg-slate-800"></span>
											<span class="h-4 w-3/4 rounded bg-slate-200 dark:bg-slate-800"></span>
											<span class="h-4 w-1/2 rounded bg-slate-200 dark:bg-slate-800"></span>
										</span>
									{/if}
								</a>
							{:else if token.type === 'nostrReference'}
								<a
									href={token.href}
									target="_blank"
									rel="external noopener noreferrer"
									class="font-medium text-sky-600 hover:text-sky-700 dark:text-sky-300 dark:hover:text-sky-200"
								>
									{getNostrReferenceText(token)}
								</a>
							{:else}
								<span class="whitespace-pre-wrap">{token.text}</span>
							{/if}
						{/each}
					</div>
					{#if isBodyCollapsible && !isBodyExpanded}
						<div
							class="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-b from-white/0 to-white dark:to-slate-950"
							aria-hidden="true"
						></div>
					{/if}
				</div>
				{#if isBodyCollapsible}
					<button
						type="button"
						class={[
							'mt-1 rounded-md font-semibold text-sky-600 transition hover:text-sky-700 dark:text-sky-300 dark:hover:text-sky-200',
							textClass.meta
						]}
						aria-expanded={isBodyExpanded}
						onclick={() => (isBodyExpanded = !isBodyExpanded)}
					>
						{isBodyExpanded ? m.show_less_post() : m.show_more_post()}
					</button>
				{/if}
			{/if}

			<div class="mt-2 flex flex-wrap gap-1.5">
				{#each post.tags as tag (tag)}
					<span
						class={[
							'rounded-md bg-sky-50 px-2 py-1 font-medium text-sky-700 dark:bg-sky-950/60 dark:text-sky-300',
							textClass.tag
						]}
					>
						{tag}
					</span>
				{/each}
			</div>

			{#if post.attachment}
				<div
					class="mt-3 rounded-md border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900"
				>
					<p class="text-xs font-semibold text-slate-400 uppercase dark:text-slate-500">
						{post.attachment.label}
					</p>
					<p class="mt-1 truncate text-sm font-bold">{post.attachment.title}</p>
					<p class={['mt-1 text-slate-600 dark:text-slate-300', textClass.attachment]}>
						{post.attachment.body}
					</p>
				</div>
			{/if}

			{#if isLoggedIn}
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
