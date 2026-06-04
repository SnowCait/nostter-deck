<script lang="ts">
	import { Heart, MessageCircle, Ellipsis, Repeat2, Share, ShieldCheck } from '@lucide/svelte';
	import { linkifyPostContent } from '$lib/deck/post-content-links';
	import { m } from '$lib/paraglide/messages.js';
	import type { Post } from '$lib/deck/types';
	import type { FontSizeTextClasses } from '$lib/font-size';
	import type { AvatarShape } from '$lib/user-settings';
	import ProfileAvatar from './ProfileAvatar.svelte';

	type Props = {
		post: Post;
		isLoggedIn: boolean;
		textClass: FontSizeTextClasses;
		avatarShape: AvatarShape;
	};

	const { post, isLoggedIn, textClass, avatarShape }: Props = $props();
	const bodyTokens = $derived(linkifyPostContent(post.body));
	let isBodyExpanded = $state(false);
	const isBodyCollapsible = $derived(post.body.length > 500 || post.body.split('\n').length > 12);
</script>

<article
	class="border-b border-slate-200 p-3 transition hover:bg-slate-50/80 dark:border-slate-800 dark:hover:bg-slate-900/80"
>
	{#if post.repostedBy}
		<div
			class={[
				'mb-2 flex min-w-0 items-center gap-1.5 pl-[3.25rem] font-semibold text-slate-500 dark:text-slate-400',
				textClass.meta
			]}
		>
			<Repeat2 class="size-4 shrink-0" aria-hidden="true" />
			<span class="truncate">{m.reposted_by({ name: post.repostedBy.author })}</span>
		</div>
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
					</div>
					<p class={['truncate text-slate-500 dark:text-slate-400', textClass.meta]}>
						{post.handle} · {post.time}
					</p>
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

			{#if post.isRepostUnavailable}
				<p class={['mt-2 text-slate-500 dark:text-slate-400', textClass.body]}>
					{m.reposted_event_unavailable()}
				</p>
			{:else}
				<div class="relative mt-2">
					<p
						data-testid="post-body"
						class={[
							'min-w-0 [overflow-wrap:anywhere] whitespace-pre-wrap text-slate-800 dark:text-slate-200',
							isBodyCollapsible && !isBodyExpanded ? 'max-h-48 overflow-hidden' : '',
							textClass.body
						]}
					>
						{#each bodyTokens as token, index (index)}
							{#if token.type === 'link'}
								<a
									href={token.href}
									target="_blank"
									rel="external noopener noreferrer"
									class="font-medium text-sky-600 hover:text-sky-700 dark:text-sky-300 dark:hover:text-sky-200"
								>
									{token.text}
								</a>
							{:else}
								{token.text}
							{/if}
						{/each}
					</p>
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
