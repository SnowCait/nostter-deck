<script lang="ts">
	import { Heart, PawPrint, Star } from '@lucide/svelte';
	import { getLikeReactionIcon } from '$lib/deck/like-reaction-icon';
	import type { LikeReaction } from '$lib/nostr/emoji-reactions';

	type Props = {
		reaction: LikeReaction;
		isActive: boolean;
		class?: string;
	};

	const { reaction, isActive, class: className = 'size-4' }: Props = $props();
	const iconName = $derived(getLikeReactionIcon(reaction));
</script>

{#if iconName === 'paw'}
	<PawPrint
		class={[className, isActive ? 'stroke-[2.5]' : '']}
		data-like-icon={iconName}
		aria-hidden="true"
	/>
{:else if iconName === 'star'}
	<Star
		class={[className, isActive ? 'fill-current' : '']}
		data-like-icon={iconName}
		aria-hidden="true"
	/>
{:else}
	<Heart
		class={[className, isActive ? 'fill-current' : '']}
		data-like-icon={iconName}
		aria-hidden="true"
	/>
{/if}
