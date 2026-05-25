<script lang="ts">
	import { m } from '$lib/paraglide/messages.js';
	import type { TimelineColumn } from '$lib/deck/types';
	import type { FontSizeTextClasses } from '$lib/font-size';
	import type { AvatarShape } from '$lib/user-settings';
	import PostCard from './PostCard.svelte';

	type Props = {
		column: TimelineColumn;
		isLoggedIn: boolean;
		textClass: FontSizeTextClasses;
		avatarShape: AvatarShape;
	};

	const { column, isLoggedIn, textClass, avatarShape }: Props = $props();
</script>

{#if column.error}
	<div
		class={[
			'flex h-full items-center justify-center p-6 text-center font-semibold text-rose-600 dark:text-rose-400',
			textClass.control
		]}
	>
		{m.custom_timeline_error({ message: column.error })}
	</div>
{:else if column.isLoading && column.posts.length === 0}
	<div
		class={[
			'flex h-full items-center justify-center p-6 text-center text-slate-500 dark:text-slate-400',
			textClass.control
		]}
	>
		{m.custom_timeline_loading()}
	</div>
{:else if column.posts.length === 0}
	<div
		class={[
			'flex h-full items-center justify-center p-6 text-center text-slate-500 dark:text-slate-400',
			textClass.control
		]}
	>
		{m.custom_timeline_empty()}
	</div>
{:else}
	{#each column.posts as post (post.id ?? `${column.id}-${post.author}-${post.time}`)}
		<PostCard {post} {isLoggedIn} {textClass} {avatarShape} />
	{/each}
{/if}
