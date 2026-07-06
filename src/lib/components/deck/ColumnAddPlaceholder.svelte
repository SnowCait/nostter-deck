<script lang="ts">
	import { Plus } from '@lucide/svelte';
	import type { FontSizeTextClasses } from '$lib/font-size';
	import { m } from '$lib/paraglide/messages.js';

	type Props = {
		isSingleColumn?: boolean;
		textClass: FontSizeTextClasses;
		onAddColumn: () => void;
	};

	const { isSingleColumn = false, textClass, onAddColumn }: Props = $props();
</script>

<div
	data-testid="column-add-placeholder"
	class={[
		'flex h-full shrink-0 flex-col items-center justify-center gap-3 border-r border-dashed border-slate-300 bg-white/60 px-4 text-slate-500 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-400',
		isSingleColumn ? 'w-full' : 'w-[342px]'
	]}
>
	<button
		type="button"
		class="flex size-11 items-center justify-center rounded-md border border-slate-300 bg-white transition hover:border-slate-400 hover:text-slate-950 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-slate-600 dark:hover:text-slate-50"
		title={m.add_column()}
		aria-label={m.add_column()}
		onclick={onAddColumn}
	>
		<Plus class="size-5" aria-hidden="true" />
	</button>
	<span class={['font-semibold', textClass.control]}>{m.add_column()}</span>
</div>
