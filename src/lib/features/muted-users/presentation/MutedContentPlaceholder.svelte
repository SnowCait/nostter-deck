<script lang="ts">
	import { EyeOff } from '@lucide/svelte';
	import type { FontSizeTextClasses } from '$lib/font-size';

	type Props = {
		message: string;
		actionLabel: string;
		textClass: FontSizeTextClasses;
		testId: string;
		onReveal: () => void;
		class?: string;
	};

	const {
		message,
		actionLabel,
		textClass,
		testId,
		onReveal,
		class: className = ''
	}: Props = $props();
</script>

<div
	data-testid={testId}
	class={[
		'flex min-h-20 items-center gap-3 border-b border-slate-200 bg-slate-50/70 p-3 text-slate-500 dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-400',
		className
	]}
>
	<EyeOff class="size-5 shrink-0" aria-hidden="true" />
	<div class="min-w-0 flex-1">
		<p class={['font-medium', textClass.body]}>{message}</p>
		<button
			type="button"
			class={[
				'mt-1 rounded-sm font-semibold text-sky-600 hover:underline focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:outline-none dark:text-sky-300',
				textClass.meta
			]}
			onclick={onReveal}
		>
			{actionLabel}
		</button>
	</div>
</div>
