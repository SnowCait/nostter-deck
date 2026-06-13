<script lang="ts">
	import { Check, Clipboard, FileJson } from '@lucide/svelte';
	import type * as Nostr from 'nostr-typedef';
	import * as Dialog from '$lib/components/ui/dialog';
	import { m } from '$lib/paraglide/messages.js';
	import type { FontSizeTextClasses } from '$lib/font-size';
	import { encodeEventPointer } from '$lib/nostr/nip19';

	type EventEntry = {
		key: 'source' | 'referenced';
		label: string;
		event: Nostr.Event;
	};

	type Props = {
		isOpen: boolean;
		entries: EventEntry[];
		textClass: FontSizeTextClasses;
	};

	let { isOpen = $bindable(), entries, textClass }: Props = $props();
	let selectedKey = $state<EventEntry['key']>('source');
	let copyStatus = $state<'idle' | 'json' | 'pointer' | 'failed'>('idle');
	let copyStatusTimeout: ReturnType<typeof setTimeout> | undefined;

	const selectedEntry = $derived(entries.find((entry) => entry.key === selectedKey) ?? entries[0]);
	const formattedJson = $derived(selectedEntry ? JSON.stringify(selectedEntry.event, null, 2) : '');
	const eventPointer = $derived(selectedEntry ? encodeEventPointer(selectedEntry.event) : null);

	$effect(() => {
		if (!isOpen) {
			selectedKey = entries[0]?.key ?? 'source';
			clearCopyStatus();
		}
	});

	function selectEntry(key: EventEntry['key']) {
		selectedKey = key;
		clearCopyStatus();
	}

	async function copyValue(value: string, status: 'json' | 'pointer') {
		clearCopyStatus();
		try {
			await navigator.clipboard.writeText(value);
			copyStatus = status;
		} catch {
			copyStatus = 'failed';
		}
		copyStatusTimeout = setTimeout(() => {
			copyStatus = 'idle';
			copyStatusTimeout = undefined;
		}, 2000);
	}

	function clearCopyStatus() {
		if (copyStatusTimeout) clearTimeout(copyStatusTimeout);
		copyStatusTimeout = undefined;
		copyStatus = 'idle';
	}
</script>

<Dialog.Root bind:open={isOpen}>
	<Dialog.Content
		class="max-h-[calc(100dvh-2rem)] max-w-[calc(100%-2rem)] grid-rows-[auto_minmax(0,1fr)] gap-3 overflow-hidden rounded-md border border-slate-200 bg-white p-4 text-slate-950 shadow-xl ring-0 sm:max-w-5xl dark:border-slate-800 dark:bg-slate-950 dark:text-slate-50"
		closeLabel={m.close()}
	>
		<div class="flex min-w-0 items-center gap-2 pr-10">
			<FileJson class="size-4 shrink-0 text-slate-500 dark:text-slate-400" aria-hidden="true" />
			<Dialog.Title class={['min-w-0 truncate font-bold', textClass.title]}>
				{m.event_json()}
			</Dialog.Title>
		</div>

		<div class="flex min-h-0 max-w-full min-w-0 flex-col gap-3">
			{#if entries.length > 1}
				<div
					role="tablist"
					aria-label={m.event_json()}
					class="flex shrink-0 gap-1 border-b border-slate-200 dark:border-slate-800"
				>
					{#each entries as entry (entry.key)}
						<button
							type="button"
							role="tab"
							aria-selected={selectedEntry?.key === entry.key}
							class={[
								'-mb-px border-b-2 px-3 py-2 font-semibold transition focus-visible:rounded-t-md focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:outline-none',
								selectedEntry?.key === entry.key
									? 'border-sky-500 text-sky-700 dark:text-sky-300'
									: 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200',
								textClass.control
							]}
							onclick={() => selectEntry(entry.key)}
						>
							{entry.label}
						</button>
					{/each}
				</div>
			{/if}

			<div
				class="flex min-h-0 max-w-full min-w-0 flex-1 flex-col overflow-hidden rounded-md border border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900"
			>
				<div
					class="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 px-3 py-2 dark:border-slate-800"
				>
					<span
						class={['truncate font-semibold text-slate-600 dark:text-slate-300', textClass.control]}
					>
						{selectedEntry?.label}
					</span>
					<div class="flex shrink-0 flex-wrap justify-end gap-1">
						{#if eventPointer}
							<button
								type="button"
								class={[
									'flex items-center gap-1.5 rounded-md px-2 py-1 font-semibold text-slate-600 transition hover:bg-slate-200 hover:text-slate-900 focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:outline-none dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white',
									textClass.control
								]}
								onclick={() => copyValue(eventPointer.value, 'pointer')}
							>
								{#if copyStatus === 'pointer'}
									<Check class="size-4" aria-hidden="true" />
									{m.copied()}
								{:else}
									<Clipboard class="size-4" aria-hidden="true" />
									{eventPointer.type === 'naddr' ? m.copy_naddr() : m.copy_nevent()}
								{/if}
							</button>
						{/if}
						<button
							type="button"
							class={[
								'flex items-center gap-1.5 rounded-md px-2 py-1 font-semibold text-slate-600 transition hover:bg-slate-200 hover:text-slate-900 focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:outline-none dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white',
								textClass.control
							]}
							onclick={() => copyValue(formattedJson, 'json')}
						>
							{#if copyStatus === 'json'}
								<Check class="size-4" aria-hidden="true" />
								{m.copied()}
							{:else}
								<Clipboard class="size-4" aria-hidden="true" />
								{m.copy_json()}
							{/if}
						</button>
					</div>
				</div>
				<pre
					data-testid="event-json"
					class="min-h-0 max-w-full min-w-0 flex-1 overflow-x-hidden overflow-y-auto p-3 font-mono text-xs leading-5 [overflow-wrap:anywhere] break-words whitespace-pre-wrap text-slate-800 dark:text-slate-200"><code
						>{formattedJson}</code
					></pre>
			</div>
			<p class="sr-only" aria-live="polite">
				{copyStatus === 'json' || copyStatus === 'pointer'
					? m.copied()
					: copyStatus === 'failed'
						? m.copy_failed()
						: ''}
			</p>
		</div>
	</Dialog.Content>
</Dialog.Root>
