<script lang="ts">
	import { getPostTimestampFormatter } from './post-timestamp-context.svelte';

	const { createdAt, class: className }: { createdAt: number; class: string } = $props();
	const format = getPostTimestampFormatter();
	const date = $derived(new Date(createdAt * 1000));
</script>

{#if Number.isFinite(date.getTime())}
	<time
		datetime={date.toISOString()}
		class={`max-w-full [overflow-wrap:anywhere] text-slate-500 dark:text-slate-400 ${className}`}
		>{format(date)}</time
	>
{/if}
