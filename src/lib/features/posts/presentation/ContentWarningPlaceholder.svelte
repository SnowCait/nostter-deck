<script lang="ts">
	import { EyeOff } from '@lucide/svelte';
	import { m } from '$lib/paraglide/messages.js';
	import type { FontSizeTextClasses } from '$lib/font-size';

	type Props = {
		reason?: string;
		textClass: FontSizeTextClasses;
		testId: string;
		onReveal: () => void;
		class?: string;
	};

	const { reason, textClass, testId, onReveal, class: className = '' }: Props = $props();
</script>

<div
	data-testid={testId}
	class={[
		'flex min-h-20 items-center gap-3 rounded-md border border-amber-200 bg-amber-50/80 p-3 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200',
		className
	]}
>
	<EyeOff class="size-5 shrink-0" aria-hidden="true" />
	<div class="min-w-0 flex-1">
		<p class={['font-medium', textClass.body]}>{m.sensitive_content()}</p>
		{#if reason}
			<p class={['mt-1 break-words text-amber-800 dark:text-amber-300', textClass.meta]}>
				{m.content_warning_reason({ reason })}
			</p>
		{/if}
		<button
			type="button"
			class={[
				'mt-1 rounded-sm font-semibold text-amber-700 hover:underline focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none dark:text-amber-300',
				textClass.meta
			]}
			onclick={onReveal}
		>
			{m.show_sensitive_content()}
		</button>
	</div>
</div>
