<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { AvatarShape } from '$lib/user-settings';

	type Props = {
		shape: AvatarShape;
		sizeClass: string;
		imageUrl?: string;
		fallbackText?: string;
		fallbackClass?: string;
		testId?: string;
		children?: Snippet;
	};

	const {
		shape,
		sizeClass,
		imageUrl,
		fallbackText = '',
		fallbackClass = '',
		testId,
		children
	}: Props = $props();
	const shapeClass = $derived(shape === 'circle' ? 'rounded-full' : 'rounded-md');
</script>

{#if imageUrl}
	<img
		data-testid={testId}
		class={[sizeClass, 'shrink-0 object-cover', shapeClass]}
		src={imageUrl}
		alt=""
		loading="lazy"
	/>
{:else}
	<div
		data-testid={testId}
		class={[sizeClass, 'flex shrink-0 items-center justify-center', fallbackClass, shapeClass]}
	>
		{#if children}
			{@render children()}
		{:else}
			{fallbackText}
		{/if}
	</div>
{/if}
