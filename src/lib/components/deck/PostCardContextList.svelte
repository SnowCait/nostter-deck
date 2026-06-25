<script lang="ts">
	import { ChevronRight, Heart, MessageCircle, Repeat2 } from '@lucide/svelte';
	import { m } from '$lib/paraglide/messages.js';
	import type { Post, PostContext, PostMessage } from '$lib/deck/types';
	import type { FontSizeTextClasses } from '$lib/font-size';
	import type { CustomEmoji } from '$lib/nostr/custom-emoji';
	import CustomEmojiText from './CustomEmojiText.svelte';

	type Props = {
		contexts?: PostContext[];
		post: Post;
		textClass: FontSizeTextClasses;
		onOpenThread?: (post: Post) => void;
	};

	const { contexts, post, textClass, onOpenThread }: Props = $props();

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

	function getPostMessageTokens(message: PostMessage): { text: string; emojis: CustomEmoji[] }[] {
		const nameMarker = '\uE000name\uE001';
		const contentMarker = '\uE000content\uE001';
		let text: string;
		const values: Record<string, { text: string; emojis: CustomEmoji[] }> = {};

		switch (message.key) {
			case 'reposted_by':
				text = m.reposted_by({ name: nameMarker });
				values[nameMarker] = { text: message.params.name, emojis: message.nameEmojis };
				break;
			case 'reacted_by_like':
				text = m.reacted_by_like({ name: nameMarker });
				values[nameMarker] = { text: message.params.name, emojis: message.nameEmojis };
				break;
			case 'reacted_by':
				text = m.reacted_by({ name: nameMarker, content: contentMarker });
				values[nameMarker] = { text: message.params.name, emojis: message.nameEmojis };
				values[contentMarker] = {
					text: message.params.content,
					emojis: message.contentEmojis
				};
				break;
			default:
				return [{ text: formatPostMessage(message), emojis: [] }];
		}

		return text
			.split(/(\uE000name\uE001|\uE000content\uE001)/)
			.filter(Boolean)
			.map((part) => values[part] ?? { text: part, emojis: [] });
	}
</script>

{#if contexts}
	{#each contexts as context, index (`${context.icon}:${context.message.key}:${index}`)}
		{#if context.icon === 'reply' && post.thread}
			<button
				type="button"
				data-keyboard-open-thread
				class={[
					'mb-2 flex w-full min-w-0 items-center gap-1.5 rounded-md py-1 pr-1 pl-[3.25rem] font-semibold text-slate-500 transition hover:bg-sky-50 hover:text-sky-700 focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:outline-none dark:text-slate-400 dark:hover:bg-sky-950/40 dark:hover:text-sky-300',
					textClass.meta
				]}
				title={m.open_thread()}
				aria-label={m.open_thread()}
				onclick={() => onOpenThread?.(post)}
			>
				<MessageCircle class="size-4 shrink-0" aria-hidden="true" />
				<span class="min-w-0 flex-1 truncate text-left">
					{#each getPostMessageTokens(context.message) as messageToken, messageIndex (messageIndex)}
						<CustomEmojiText text={messageToken.text} customEmojis={messageToken.emojis} />
					{/each}
				</span>
				<ChevronRight class="size-4 shrink-0" aria-hidden="true" />
			</button>
		{:else}
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
				<span class="truncate">
					{#each getPostMessageTokens(context.message) as messageToken, messageIndex (messageIndex)}
						<CustomEmojiText text={messageToken.text} customEmojis={messageToken.emojis} />
					{/each}
				</span>
			</div>
		{/if}
	{/each}
{/if}
