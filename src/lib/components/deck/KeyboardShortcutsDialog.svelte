<script lang="ts">
	import { Keyboard } from '@lucide/svelte';
	import * as Dialog from '$lib/components/ui/dialog';
	import type { FontSizeTextClasses } from '$lib/font-size';
	import { m } from '$lib/paraglide/messages.js';

	type Props = {
		isOpen: boolean;
		textClass: FontSizeTextClasses;
	};

	let { isOpen = $bindable(), textClass }: Props = $props();

	const shortcutGroups = $derived([
		{
			title: m.keyboard_shortcuts_navigation(),
			shortcuts: [
				{ keys: ['H', '←'], label: m.keyboard_shortcut_previous_column() },
				{ keys: ['L', '→'], label: m.keyboard_shortcut_next_column() },
				{ keys: ['K', '↑'], label: m.keyboard_shortcut_previous_post() },
				{ keys: ['J', '↓'], label: m.keyboard_shortcut_next_post() }
			]
		},
		{
			title: m.keyboard_shortcuts_post_actions(),
			shortcuts: [
				{ keys: ['Enter'], label: m.keyboard_shortcut_open_thread() },
				{ keys: ['P'], label: m.keyboard_shortcut_open_profile() }
			]
		},
		{
			title: m.keyboard_shortcuts_other(),
			shortcuts: [
				{ keys: ['Esc'], label: m.keyboard_shortcut_close_detail() },
				{ keys: ['?'], label: m.keyboard_shortcut_show_shortcuts() }
			]
		}
	]);

	function close() {
		isOpen = false;
	}
</script>

<Dialog.Root bind:open={isOpen}>
	<Dialog.Content
		class="max-h-[calc(100dvh-2rem)] max-w-sm gap-0 overflow-y-auto overscroll-contain rounded-md border border-slate-200 bg-white p-4 text-slate-950 shadow-xl ring-0 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-50"
		showCloseButton={false}
		overlayProps={{ onclick: close }}
	>
		<div class="mb-4 flex items-center justify-between gap-3">
			<div class="flex min-w-0 items-center gap-2">
				<Keyboard class="size-4 shrink-0 text-slate-500 dark:text-slate-400" aria-hidden="true" />
				<Dialog.Title class={['min-w-0 truncate font-bold', textClass.title]}>
					{m.keyboard_shortcuts()}
				</Dialog.Title>
			</div>
			<button
				type="button"
				class={[
					'h-9 rounded-md px-3 font-semibold text-slate-600 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-900',
					textClass.control
				]}
				onclick={close}
			>
				{m.close()}
			</button>
		</div>

		<div class="space-y-5">
			{#each shortcutGroups as group (group.title)}
				<section>
					<h3
						class={[
							'mb-2 font-bold tracking-wide text-slate-500 uppercase dark:text-slate-400',
							textClass.section
						]}
					>
						{group.title}
					</h3>
					<dl class="divide-y divide-slate-200 dark:divide-slate-800">
						{#each group.shortcuts as shortcut (shortcut.label)}
							<div class="flex min-h-10 items-center justify-between gap-4 py-2">
								<dt class={['text-slate-700 dark:text-slate-300', textClass.control]}>
									{shortcut.label}
								</dt>
								<dd class="flex shrink-0 items-center gap-1">
									{#each shortcut.keys as key (key)}
										<kbd
											class={[
												'inline-flex min-w-7 items-center justify-center rounded border border-slate-300 bg-slate-50 px-1.5 py-1 font-mono font-semibold text-slate-700 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200',
												textClass.meta
											]}
										>
											{key}
										</kbd>
									{/each}
								</dd>
							</div>
						{/each}
					</dl>
				</section>
			{/each}
		</div>
	</Dialog.Content>
</Dialog.Root>
