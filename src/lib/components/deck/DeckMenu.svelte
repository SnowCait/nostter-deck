<script lang="ts">
	import { Check, ChevronDown, Copy, LayoutDashboard, Pencil, Plus, Trash2 } from '@lucide/svelte';
	import type { ColumnDeck } from '$lib/deck/column-decks';
	import type { FontSizeTextClasses } from '$lib/font-size';
	import { m } from '$lib/paraglide/messages.js';
	import * as Dialog from '$lib/components/ui/dialog';
	import * as Popover from '$lib/components/ui/popover';

	type NameAction = 'create' | 'rename' | 'duplicate';
	type Props = {
		decks: ColumnDeck[];
		activeDeckId: string;
		isCollapsed: boolean;
		textClass: FontSizeTextClasses;
		onSelectDeck: (deckId: string) => Promise<void>;
		onCreateDeck: (name: string) => Promise<void>;
		onRenameDeck: (deckId: string, name: string) => void;
		onDuplicateDeck: (deckId: string, name: string) => Promise<void>;
		onDeleteDeck: (deckId: string) => Promise<void>;
	};

	let {
		decks,
		activeDeckId,
		isCollapsed,
		textClass,
		onSelectDeck,
		onCreateDeck,
		onRenameDeck,
		onDuplicateDeck,
		onDeleteDeck
	}: Props = $props();
	let isMenuOpen = $state(false);
	let isNameDialogOpen = $state(false);
	let isDeleteDialogOpen = $state(false);
	let nameAction = $state<NameAction>('create');
	let targetDeck = $state<ColumnDeck | null>(null);
	let deckName = $state('');

	const sidebarLabelClass = () =>
		[
			'min-w-0 overflow-hidden whitespace-nowrap transition-all duration-150 ease-out',
			isCollapsed ? 'max-w-0 opacity-0' : 'max-w-[150px] opacity-100'
		].join(' ');
	const activeDeck = $derived(decks.find((deck) => deck.id === activeDeckId) ?? decks[0]);
	const normalizedDeckName = $derived(deckName.trim());
	const isDuplicateName = $derived(
		decks.some(
			(deck) =>
				deck.id !== (nameAction === 'rename' ? targetDeck?.id : undefined) &&
				deck.name.toLocaleLowerCase() === normalizedDeckName.toLocaleLowerCase()
		)
	);
	const canSaveName = $derived(normalizedDeckName.length > 0 && !isDuplicateName);

	function openNameDialog(action: NameAction, deck?: ColumnDeck) {
		nameAction = action;
		targetDeck = deck ?? null;
		deckName =
			action === 'create'
				? ''
				: action === 'duplicate'
					? `${deck?.name ?? ''} copy`
					: (deck?.name ?? '');
		isMenuOpen = false;
		isNameDialogOpen = true;
	}

	async function saveName() {
		if (!canSaveName) return;
		if (nameAction === 'create') await onCreateDeck(normalizedDeckName);
		if (nameAction === 'rename' && targetDeck) onRenameDeck(targetDeck.id, normalizedDeckName);
		if (nameAction === 'duplicate' && targetDeck) {
			await onDuplicateDeck(targetDeck.id, normalizedDeckName);
		}
		isNameDialogOpen = false;
	}

	function requestDelete(deck: ColumnDeck) {
		targetDeck = deck;
		isMenuOpen = false;
		isDeleteDialogOpen = true;
	}

	async function confirmDelete() {
		if (!targetDeck || decks.length <= 1) return;
		await onDeleteDeck(targetDeck.id);
		isDeleteDialogOpen = false;
		targetDeck = null;
	}
</script>

<Popover.Root bind:open={isMenuOpen}>
	<Popover.Trigger
		type="button"
		class={[
			'group flex h-11 w-full items-center rounded-md font-medium text-slate-300 transition hover:bg-white/10 hover:text-white',
			textClass.control
		]}
		aria-label={m.deck_menu()}
		title={activeDeck?.name ?? m.deck_menu()}
	>
		<span class="flex size-11 shrink-0 items-center justify-center">
			<LayoutDashboard class="size-5 shrink-0" aria-hidden="true" />
		</span>
		<span class={`${sidebarLabelClass()} flex min-w-0 flex-1 items-center gap-2 text-left`}>
			<span class="truncate">{activeDeck?.name ?? m.deck_menu()}</span>
			<ChevronDown class="size-4 shrink-0 text-slate-500" aria-hidden="true" />
		</span>
	</Popover.Trigger>
	<Popover.Content
		align="start"
		side="right"
		sideOffset={8}
		portalProps={{ to: 'body' }}
		class="z-[70] w-80 gap-3 border border-slate-200 bg-white p-3 text-slate-950 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-50"
		data-testid="deck-menu"
	>
		<p class={['font-bold', textClass.heading]}>{m.deck_menu()}</p>
		<div class="grid gap-1">
			{#each decks as deck (deck.id)}
				<div
					class={[
						'flex min-h-11 items-center gap-1 rounded-md border p-1',
						deck.id === activeDeckId
							? 'border-sky-400 bg-sky-50 dark:border-sky-700 dark:bg-sky-950/40'
							: 'border-transparent hover:bg-slate-100 dark:hover:bg-slate-900'
					]}
				>
					<button
						type="button"
						class="flex min-w-0 flex-1 items-center gap-2 rounded px-2 py-1.5 text-left"
						onclick={() => void onSelectDeck(deck.id)}
					>
						<span class={['min-w-0 flex-1 truncate font-semibold', textClass.control]}
							>{deck.name}</span
						>
						{#if deck.id === activeDeckId}
							<Check class="size-4 shrink-0 text-sky-600 dark:text-sky-400" aria-hidden="true" />
						{/if}
					</button>
					<button
						type="button"
						class="rounded p-1.5 text-slate-400 transition hover:bg-slate-200 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
						aria-label={m.deck_rename()}
						title={m.deck_rename()}
						onclick={() => openNameDialog('rename', deck)}
					>
						<Pencil class="size-4" aria-hidden="true" />
					</button>
					<button
						type="button"
						class="rounded p-1.5 text-slate-400 transition hover:bg-slate-200 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
						aria-label={m.deck_duplicate()}
						title={m.deck_duplicate()}
						onclick={() => openNameDialog('duplicate', deck)}
					>
						<Copy class="size-4" aria-hidden="true" />
					</button>
					<button
						type="button"
						class="rounded p-1.5 text-slate-400 transition hover:bg-rose-100 hover:text-rose-700 disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-rose-950 dark:hover:text-rose-300"
						aria-label={m.deck_delete()}
						title={m.deck_delete()}
						disabled={decks.length <= 1}
						onclick={() => requestDelete(deck)}
					>
						<Trash2 class="size-4" aria-hidden="true" />
					</button>
				</div>
			{/each}
		</div>
		<button
			type="button"
			class={[
				'flex w-full items-center justify-center gap-2 rounded-md bg-sky-500 px-3 py-2 font-semibold text-white transition hover:bg-sky-600',
				textClass.control
			]}
			onclick={() => openNameDialog('create')}
		>
			<Plus class="size-4" aria-hidden="true" />
			{m.deck_new()}
		</button>
	</Popover.Content>
</Popover.Root>

<Dialog.Root bind:open={isNameDialogOpen}>
	<Dialog.Content
		closeLabel={m.close()}
		class="max-w-sm bg-white text-slate-950 dark:bg-slate-950 dark:text-slate-50"
	>
		<Dialog.Title class="font-bold">
			{#if nameAction === 'create'}
				{m.deck_create()}
			{:else if nameAction === 'rename'}
				{m.deck_rename()}
			{:else}
				{m.deck_duplicate()}
			{/if}
		</Dialog.Title>
		<label class="mt-4 grid gap-1 text-sm font-semibold" for="deck-name">
			{m.deck_name()}
			<input
				id="deck-name"
				class="h-10 rounded border border-slate-300 bg-transparent px-3 dark:border-slate-700"
				bind:value={deckName}
				onkeydown={(event) => event.key === 'Enter' && void saveName()}
			/>
		</label>
		<div class="mt-5 flex justify-end gap-2">
			<button
				type="button"
				class="rounded-md border border-slate-300 px-3 py-2 font-semibold dark:border-slate-700"
				onclick={() => (isNameDialogOpen = false)}
			>
				{m.cancel()}
			</button>
			<button
				type="button"
				class="rounded-md bg-sky-500 px-3 py-2 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
				disabled={!canSaveName}
				onclick={() => void saveName()}
			>
				{m.save()}
			</button>
		</div>
	</Dialog.Content>
</Dialog.Root>

<Dialog.Root bind:open={isDeleteDialogOpen}>
	<Dialog.Content
		closeLabel={m.close()}
		class="max-w-sm bg-white text-slate-950 dark:bg-slate-950 dark:text-slate-50"
	>
		<Dialog.Title class="font-bold">{m.deck_delete_title()}</Dialog.Title>
		<Dialog.Description class="mt-2 text-slate-600 dark:text-slate-300">
			{m.deck_delete_description({ name: targetDeck?.name ?? '' })}
		</Dialog.Description>
		<div class="mt-5 flex justify-end gap-2">
			<button
				type="button"
				class="rounded-md border border-slate-300 px-3 py-2 font-semibold dark:border-slate-700"
				onclick={() => (isDeleteDialogOpen = false)}
			>
				{m.cancel()}
			</button>
			<button
				type="button"
				class="rounded-md bg-rose-600 px-3 py-2 font-semibold text-white"
				onclick={() => void confirmDelete()}
			>
				{m.deck_delete_confirm()}
			</button>
		</div>
	</Dialog.Content>
</Dialog.Root>
