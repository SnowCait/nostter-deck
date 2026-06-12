<script lang="ts">
	import { tokenizeCustomEmojiText, type CustomEmoji } from '$lib/nostr/custom-emoji';

	type Props = {
		text: string;
		customEmojis?: CustomEmoji[];
		whitespaceClass?: string;
	};

	let { text, customEmojis = [], whitespaceClass = '' }: Props = $props();
	const tokens = $derived(tokenizeCustomEmojiText(text, customEmojis));
	let failedUrls = $state<string[]>([]);

	function handleImageError(url: string) {
		if (!failedUrls.includes(url)) failedUrls = [...failedUrls, url];
	}
</script>

{#each tokens as token, index (`${token.type}:${token.text}:${index}`)}
	{#if token.type === 'customEmoji' && !failedUrls.includes(token.url)}
		<img
			src={token.url}
			alt={token.text}
			title={token.text}
			class="mx-0.5 inline-block size-[1.25em] object-contain align-[-0.25em]"
			loading="lazy"
			onerror={() => handleImageError(token.url)}
		/>
	{:else}
		<span class={whitespaceClass}>{token.text}</span>
	{/if}
{/each}
