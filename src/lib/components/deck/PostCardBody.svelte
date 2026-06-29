<script lang="ts">
	import { linkifyPostContent, type PostContentToken } from '$lib/deck/post-content-links';
	import {
		clearUrlPreviewImage,
		getUrlMediaMetadata,
		requestUrlMediaMetadata,
		setUrlImageDimensions,
		type UrlMediaMetadata
	} from '$lib/deck/url-media';
	import { m } from '$lib/paraglide/messages.js';
	import type { Post } from '$lib/deck/types';
	import type { FontSizeTextClasses } from '$lib/font-size';
	import type { ProfilePointer } from '$lib/nostr/nip19';
	import { getProfileDisplayName, type Profile } from '$lib/nostr/profiles';
	import type { AvatarShape } from '$lib/user-settings';
	import CustomEmojiText from './CustomEmojiText.svelte';
	import NostrQuoteCard from './NostrQuoteCard.svelte';
	import ImageViewer from './ImageViewer.svelte';

	type Props = {
		post: Post;
		textClass: FontSizeTextClasses;
		avatarShape: AvatarShape;
		getProfile: (pubkey: string) => Profile | undefined;
		requestProfiles: (pubkeys: string[], relays: string[]) => void;
		profileRelays: string[];
		isMutedUser: (pubkey: string) => boolean;
		onOpenProfile?: (profile: ProfilePointer) => void;
		onOpenThread?: (post: Post) => void;
		onOpenHashtag?: (hashtag: string) => void;
	};

	const {
		post,
		textClass,
		avatarShape,
		getProfile,
		requestProfiles,
		profileRelays,
		isMutedUser,
		onOpenProfile,
		onOpenThread,
		onOpenHashtag
	}: Props = $props();

	const bodyEvent = $derived(post.events.referenced ?? post.events.source);
	const bodyHashtags = $derived(
		bodyEvent.tags.flatMap((tag) => (tag[0] === 't' && tag[1] ? [tag[1]] : []))
	);
	const bodyTokens = $derived(linkifyPostContent(post.body, post.bodyEmojis, bodyHashtags));
	const isBodyCollapsible = $derived(post.body.length > 500 || post.body.split('\n').length > 12);
	const directImageUrls = $derived(
		bodyTokens.flatMap((token) => {
			if (token.type !== 'link') return [];
			const media = getUrlMediaMetadata(token.href);
			return media?.status === 'image' ? [media.url] : [];
		})
	);

	let isBodyExpanded = $state(false);
	let isImageViewerOpen = $state(false);
	let currentImageIndex = $state(0);
	let failedEmojiUrls = $state<string[]>([]);

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

		return `@${getProfileReferenceName(token)}`;
	}

	function getProfileReferenceName(
		token: Extract<PostContentToken, { type: 'nostrReference' }> & { pubkey: string }
	) {
		const profile = getProfile(token.pubkey);
		return getProfileDisplayName(profile, token.pubkey);
	}

	function getProfileReferenceEmojis(
		token: Extract<PostContentToken, { type: 'nostrReference' }> & { pubkey: string }
	) {
		return getProfile(token.pubkey)?.customEmojis ?? [];
	}

	function openMentionedProfile(
		token: Extract<PostContentToken, { type: 'nostrReference' }> & { pubkey: string }
	) {
		onOpenProfile?.({ pubkey: token.pubkey, relays: token.relayHints ?? [] });
	}

	function isEventReferenceToken(
		token: PostContentToken
	): token is Extract<PostContentToken, { type: 'nostrReference' }> & { eventId: string } {
		return (
			token.type === 'nostrReference' &&
			(token.entityType === 'note' || token.entityType === 'nevent') &&
			typeof token.eventId === 'string'
		);
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

	function openImageViewer(tokenIndex: number) {
		currentImageIndex = bodyTokens.slice(0, tokenIndex + 1).reduce((imageIndex, token) => {
			if (token.type !== 'link') return imageIndex;
			return getUrlMediaMetadata(token.href)?.status === 'image' ? imageIndex + 1 : imageIndex;
		}, -1);
		isImageViewerOpen = true;
	}

	function handleEmojiError(url: string) {
		if (!failedEmojiUrls.includes(url)) failedEmojiUrls = [...failedEmojiUrls, url];
	}
</script>

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
				{#if media?.status === 'image'}
					<button
						type="button"
						data-testid="url-preview"
						data-url={media.url}
						style={getImagePreviewStyle(media)}
						class={[
							'my-2 flex overflow-hidden rounded-md border border-slate-200 bg-slate-50 text-slate-600 transition hover:border-slate-300 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-slate-700 dark:hover:bg-slate-800',
							hasImageDimensions(media) ? '' : 'h-48'
						]}
						aria-label={m.open_image_viewer()}
						onclick={() => openImageViewer(index)}
					>
						<img
							src={media.url}
							alt={token.text}
							class="h-full w-full object-contain"
							loading="lazy"
							onload={(event) => loadPreviewImage(event, media.url)}
						/>
					</button>
				{:else}
					<a
						href={token.href}
						target="_blank"
						rel="external noopener noreferrer"
						data-testid="url-preview"
						class="my-2 flex h-48 overflow-hidden rounded-md border border-slate-200 bg-slate-50 text-slate-600 transition hover:border-slate-300 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-slate-700 dark:hover:bg-slate-800"
					>
						{#if media?.status === 'link'}
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
				{/if}
			{:else if token.type === 'nostrReference'}
				{#if isEventReferenceToken(token)}
					<NostrQuoteCard
						href={token.href}
						eventId={token.eventId}
						relayHints={token.relayHints ?? []}
						{textClass}
						{avatarShape}
						{getProfile}
						{isMutedUser}
						{onOpenThread}
					/>
				{:else if isProfileReferenceToken(token)}
					<button
						type="button"
						title={m.open_profile({ name: getProfileReferenceName(token) })}
						aria-label={m.open_profile({ name: getProfileReferenceName(token) })}
						class="font-medium text-sky-600 hover:text-sky-700 hover:underline focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:outline-none dark:text-sky-300 dark:hover:text-sky-200"
						onclick={() => openMentionedProfile(token)}
					>
						<CustomEmojiText
							text={getNostrReferenceText(token)}
							customEmojis={getProfileReferenceEmojis(token)}
						/>
					</button>
				{:else}
					<a
						href={token.href}
						target="_blank"
						rel="external noopener noreferrer"
						class="font-medium text-sky-600 hover:text-sky-700 dark:text-sky-300 dark:hover:text-sky-200"
					>
						{getNostrReferenceText(token)}
					</a>
				{/if}
			{:else if token.type === 'customEmoji'}
				{#if failedEmojiUrls.includes(token.url)}
					<span>{token.text}</span>
				{:else}
					<img
						src={token.url}
						alt={token.text}
						title={token.text}
						class="my-[-0.1em] inline-block h-[1.4em] w-auto object-contain align-[-0.3em]"
						loading="lazy"
						onerror={() => handleEmojiError(token.url)}
					/>
				{/if}
			{:else if token.type === 'hashtag'}
				<button
					type="button"
					class="font-medium text-sky-600 hover:text-sky-700 hover:underline focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:outline-none dark:text-sky-300 dark:hover:text-sky-200"
					onclick={() => onOpenHashtag?.(token.text)}
				>
					{token.text}
				</button>
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

<ImageViewer
	images={directImageUrls}
	bind:open={isImageViewerOpen}
	bind:currentIndex={currentImageIndex}
/>
