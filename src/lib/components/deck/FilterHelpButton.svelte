<script lang="ts">
	import { CircleQuestionMark } from '@lucide/svelte';
	import * as Popover from '$lib/components/ui/popover';
	import { m } from '$lib/paraglide/messages.js';
	import type { FontSizeTextClasses } from '$lib/font-size';

	type Props = {
		textClass: FontSizeTextClasses;
	};

	const { textClass }: Props = $props();
	let isOpen = $state(false);
	const helpText = $derived(m.custom_timeline_filters_help());
</script>

<Popover.Root bind:open={isOpen}>
	<Popover.Trigger
		type="button"
		class={[
			'flex size-7 shrink-0 items-center justify-center rounded-md text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 focus-visible:ring-2 focus-visible:ring-sky-200 focus-visible:outline-none dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100 dark:focus-visible:ring-sky-900',
			textClass.control
		]}
		aria-label={helpText}
		title={helpText}
	>
		<CircleQuestionMark class="size-4" aria-hidden="true" />
	</Popover.Trigger>
	<Popover.Content align="start" sideOffset={6} class="w-72 text-slate-600 dark:text-slate-300">
		<p class={textClass.meta}>{helpText}</p>
	</Popover.Content>
</Popover.Root>
