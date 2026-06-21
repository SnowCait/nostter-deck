<script lang="ts">
	import { Send } from '@lucide/svelte';
	import { m } from '$lib/paraglide/messages.js';
	import type { ChannelTimelineColumnConfig } from '$lib/deck/types';
	import type { FontSizeTextClasses } from '$lib/font-size';
	import type { PublishPostResult } from '$lib/nostr/publish';

	type Props = {
		channel: ChannelTimelineColumnConfig;
		textClass: FontSizeTextClasses;
		onPublish: (content: string) => Promise<PublishPostResult>;
	};

	let { channel, textClass, onPublish }: Props = $props();
	let content = $state('');
	let isPublishing = $state(false);
	let publishError = $state(false);

	const canSubmit = $derived(!isPublishing && content.trim().length > 0);

	async function publish() {
		if (!canSubmit) return;

		isPublishing = true;
		publishError = false;
		const result = await onPublish(content);
		isPublishing = false;

		if (!result.ok) {
			publishError = true;
			return;
		}

		content = '';
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key !== 'Enter' || (!event.ctrlKey && !event.metaKey)) return;

		event.preventDefault();
		void publish();
	}
</script>

<section
	class="shrink-0 border-b border-slate-200 bg-slate-50 px-3 py-3 dark:border-slate-800 dark:bg-slate-900/70"
	data-testid="channel-composer"
>
	<form
		class="grid gap-2"
		onsubmit={(event) => {
			event.preventDefault();
			void publish();
		}}
	>
		<div class="flex items-center gap-2">
			<label class="sr-only" for={`channel-compose-${channel.id}`}>{m.channel_post_text()}</label>
			<textarea
				id={`channel-compose-${channel.id}`}
				rows="1"
				class={[
					'min-h-10 min-w-0 flex-1 resize-y rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-950 transition outline-none placeholder:text-slate-400 focus:border-sky-500 focus:ring-2 focus:ring-sky-100 disabled:cursor-wait dark:border-slate-700 dark:bg-slate-950 dark:text-slate-50 dark:placeholder:text-slate-500 dark:focus:border-sky-400 dark:focus:ring-sky-950',
					textClass.control
				]}
				placeholder={m.channel_compose_placeholder()}
				disabled={isPublishing}
				aria-keyshortcuts="Control+Enter Meta+Enter"
				bind:value={content}
				onkeydown={handleKeydown}
			></textarea>
			<button
				type="submit"
				class={[
					'inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-md bg-sky-500 px-3 font-bold text-white transition hover:bg-sky-600 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500 dark:bg-sky-400 dark:text-slate-950 dark:hover:bg-sky-300 disabled:dark:bg-slate-800 disabled:dark:text-slate-500',
					textClass.control
				]}
				disabled={!canSubmit}
			>
				<Send class="size-4" aria-hidden="true" />
				{isPublishing ? m.post_sending() : m.action_post()}
			</button>
		</div>
		{#if publishError}
			<p class={['text-rose-600 dark:text-rose-400', textClass.meta]} role="alert">
				{m.post_failed()}
			</p>
		{/if}
	</form>
</section>
