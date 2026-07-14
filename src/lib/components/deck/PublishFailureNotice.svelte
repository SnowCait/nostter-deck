<script lang="ts">
	import { Check, Clipboard } from '@lucide/svelte';
	import type { FontSizeTextClasses } from '$lib/font-size';
	import type { PublishPostResult } from '$lib/nostr/publish';
	import { formatPublishDiagnostic } from '$lib/nostr/publish-diagnostics';
	import { m } from '$lib/paraglide/messages.js';

	type PublishFailure = Extract<PublishPostResult, { ok: false }>;
	type Props = {
		failure: PublishFailure;
		textClass: FontSizeTextClasses;
	};

	let { failure, textClass }: Props = $props();
	let copyStatus = $state<'idle' | 'copied' | 'failed'>('idle');
	let copyStatusTimeout: ReturnType<typeof setTimeout> | undefined;

	const message = $derived.by(() => {
		switch (failure.reason) {
			case 'signing-timeout':
				return m.post_signing_timeout();
			case 'signing-failed':
				return m.post_signing_failed();
			case 'account-mismatch':
				return m.post_account_mismatch();
			case 'relay-timeout':
				return m.post_relay_timeout();
			case 'relay-rejected':
				return m.post_relay_rejected();
			default:
				return m.post_failed();
		}
	});

	async function copyDiagnostic() {
		if (!failure.diagnostic) {
			return;
		}
		clearCopyStatus();
		try {
			await navigator.clipboard.writeText(formatPublishDiagnostic(failure.diagnostic));
			copyStatus = 'copied';
		} catch {
			copyStatus = 'failed';
		}
		copyStatusTimeout = setTimeout(() => {
			copyStatus = 'idle';
			copyStatusTimeout = undefined;
		}, 2000);
	}

	function clearCopyStatus() {
		if (copyStatusTimeout) {
			clearTimeout(copyStatusTimeout);
		}
		copyStatusTimeout = undefined;
		copyStatus = 'idle';
	}
</script>

<div class="grid gap-1.5" data-testid="publish-failure-notice">
	<p class={['text-rose-600 dark:text-rose-400', textClass.control]} role="alert">
		{message}
	</p>
	{#if failure.diagnostic}
		<button
			type="button"
			class={[
				'flex w-fit items-center gap-1.5 rounded-md font-semibold text-slate-600 transition hover:text-slate-950 focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:outline-none dark:text-slate-300 dark:hover:text-white',
				textClass.meta
			]}
			onclick={copyDiagnostic}
		>
			{#if copyStatus === 'copied'}
				<Check class="size-3.5" aria-hidden="true" />
				{m.diagnostics_copied()}
			{:else}
				<Clipboard class="size-3.5" aria-hidden="true" />
				{copyStatus === 'failed' ? m.copy_failed() : m.copy_diagnostics()}
			{/if}
		</button>
	{/if}
</div>
