<script lang="ts">
	import { Braces, Ellipsis } from '@lucide/svelte';
	import type * as Nostr from 'nostr-typedef';
	import * as Popover from '$lib/components/ui/popover';
	import { m } from '$lib/paraglide/messages.js';
	import type { FontSizeTextClasses } from '$lib/font-size';
	import EventJsonDialog from './EventJsonDialog.svelte';

	type Props = {
		sourceEvent: Nostr.Event;
		referencedEvent?: Nostr.Event;
		textClass: FontSizeTextClasses;
		muteLabel?: string;
		onMute?: () => void;
		class?: string;
	};

	let {
		sourceEvent,
		referencedEvent,
		textClass,
		muteLabel,
		onMute,
		class: className
	}: Props = $props();
	let isMenuOpen = $state(false);
	let isDialogOpen = $state(false);
	const entries = $derived([
		{ key: 'source' as const, label: m.source_event(), event: sourceEvent },
		...(referencedEvent
			? [{ key: 'referenced' as const, label: m.referenced_event(), event: referencedEvent }]
			: [])
	]);

	function openDialog(event: MouseEvent) {
		event.preventDefault();
		event.stopPropagation();
		isMenuOpen = false;
		isDialogOpen = true;
	}

	function mute(event: MouseEvent) {
		event.preventDefault();
		event.stopPropagation();
		onMute?.();
		isMenuOpen = false;
	}
</script>

<div class={className}>
	<Popover.Root bind:open={isMenuOpen}>
		<Popover.Trigger
			type="button"
			class="flex size-7 shrink-0 items-center justify-center rounded-md text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:outline-none dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-slate-200"
			title={m.post_options()}
			aria-label={m.post_options()}
		>
			<Ellipsis class="size-4" aria-hidden="true" />
		</Popover.Trigger>
		<Popover.Content align="end" sideOffset={4} class="w-56 gap-1 p-1">
			<button
				type="button"
				class={[
					'flex w-full items-center gap-2 rounded-md px-3 py-2 text-left font-semibold text-slate-700 transition hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:outline-none dark:text-slate-200 dark:hover:bg-slate-800',
					textClass.control
				]}
				onclick={openDialog}
			>
				<Braces class="size-4 shrink-0" aria-hidden="true" />
				{m.view_event_json()}
			</button>
			{#if muteLabel && onMute}
				<button
					type="button"
					class={[
						'w-full rounded-md px-3 py-2 text-left font-semibold text-rose-600 transition hover:bg-rose-50 focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:outline-none dark:text-rose-400 dark:hover:bg-rose-950/40',
						textClass.control
					]}
					onclick={mute}
				>
					{muteLabel}
				</button>
			{/if}
		</Popover.Content>
	</Popover.Root>
</div>

<EventJsonDialog bind:isOpen={isDialogOpen} {entries} {textClass} />
