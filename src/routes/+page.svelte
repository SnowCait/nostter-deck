<script lang="ts">
	import { tick } from 'svelte';
	import { Plus } from '@lucide/svelte';
	import DeckColumn from '$lib/components/deck/DeckColumn.svelte';
	import Sidebar from '$lib/components/deck/Sidebar.svelte';
	import { columnSourceKeys, initialColumnConfigs, sourcePosts } from '$lib/deck/data';
	import type { Column, ColumnConfig, ColumnSourceKey } from '$lib/deck/types';
	import { m } from '$lib/paraglide/messages.js';

	let columnConfigs = $state<ColumnConfig[]>(initialColumnConfigs.map((column) => ({ ...column })));
	let activeColumnId = $state(initialColumnConfigs[0]?.id ?? '');
	let isColumnDialogOpen = $state(false);
	let openSettingsColumnId = $state<string | null>(null);
	let selectedSourceKey = $state<ColumnSourceKey>('timeline_home');
	let nextColumnId = $state(initialColumnConfigs.length + 1);

	const columns = $derived<Column[]>(
		columnConfigs.map((column) => ({
			...column,
			posts: sourcePosts[column.sourceKey]
		}))
	);

	function getColumnId(columnId: string) {
		return `deck-column-${columnId}`;
	}

	function focusColumn(columnId: string) {
		activeColumnId = columnId;

		const columnElement = document.getElementById(getColumnId(columnId));
		columnElement?.scrollIntoView({
			behavior: 'smooth',
			block: 'nearest',
			inline: 'start'
		});
		columnElement?.focus({ preventScroll: true });
	}

	function createColumnId(sourceKey: ColumnSourceKey) {
		const id = `${sourceKey}-${nextColumnId}`;
		nextColumnId += 1;
		return id;
	}

	function openAddColumnDialog() {
		selectedSourceKey = 'timeline_home';
		isColumnDialogOpen = true;
	}

	function closeColumnDialog() {
		isColumnDialogOpen = false;
	}

	async function saveColumnDialog() {
		const id = createColumnId(selectedSourceKey);
		columnConfigs = [...columnConfigs, { id, sourceKey: selectedSourceKey }];
		closeColumnDialog();
		await tick();
		focusColumn(id);
	}

	async function deleteColumn(columnId: string) {
		const deletedIndex = columnConfigs.findIndex((column) => column.id === columnId);
		if (deletedIndex < 0) return;

		const nextColumns = columnConfigs.filter((column) => column.id !== columnId);
		columnConfigs = nextColumns;
		openSettingsColumnId = null;

		if (activeColumnId !== columnId) return;

		const nextActiveColumn = nextColumns[Math.min(deletedIndex, nextColumns.length - 1)];
		activeColumnId = nextActiveColumn?.id ?? '';

		if (nextActiveColumn) {
			await tick();
			focusColumn(nextActiveColumn.id);
		}
	}

	async function moveColumn(columnId: string, direction: -1 | 1) {
		const currentIndex = columnConfigs.findIndex((column) => column.id === columnId);
		const nextIndex = currentIndex + direction;

		if (currentIndex < 0 || nextIndex < 0 || nextIndex >= columnConfigs.length) return;

		const nextColumns = [...columnConfigs];
		const [column] = nextColumns.splice(currentIndex, 1);
		nextColumns.splice(nextIndex, 0, column);
		columnConfigs = nextColumns;

		await tick();
		focusColumn(columnId);
	}

	function getColumnIndex(columnId: string) {
		return columnConfigs.findIndex((column) => column.id === columnId);
	}

	function toggleColumnSettings(columnId: string) {
		openSettingsColumnId = openSettingsColumnId === columnId ? null : columnId;
	}
</script>

<svelte:head>
	<title>{m.app_title()}</title>
</svelte:head>

<main class="flex h-screen min-h-0 bg-[#eef3f7] text-slate-950">
	<Sidebar
		{columns}
		{activeColumnId}
		onAddColumn={openAddColumnDialog}
		onSelectColumn={focusColumn}
	/>

	<section class="flex min-w-0 flex-1 flex-col">
		<div class="min-h-0 flex-1 overflow-x-auto overflow-y-hidden">
			<div class="flex h-full min-w-max">
				{#each columns as column (column.id)}
					{@const columnIndex = getColumnIndex(column.id)}
					<DeckColumn
						{column}
						id={getColumnId(column.id)}
						isFocused={activeColumnId === column.id}
						isSettingsOpen={openSettingsColumnId === column.id}
						canMoveLeft={columnIndex > 0}
						canMoveRight={columnIndex >= 0 && columnIndex < columnConfigs.length - 1}
						onToggleSettings={() => toggleColumnSettings(column.id)}
						onDelete={() => deleteColumn(column.id)}
						onMoveLeft={() => moveColumn(column.id, -1)}
						onMoveRight={() => moveColumn(column.id, 1)}
					/>
				{/each}
				<button
					type="button"
					class="flex h-full w-[342px] shrink-0 flex-col items-center justify-center gap-3 border-r border-dashed border-slate-300 bg-white/60 px-4 text-slate-500 transition hover:bg-white hover:text-slate-950"
					onclick={openAddColumnDialog}
				>
					<span
						class="flex size-11 items-center justify-center rounded-md border border-slate-300 bg-white"
					>
						<Plus class="size-5" aria-hidden="true" />
					</span>
					<span class="text-sm font-semibold">{m.add_column()}</span>
				</button>
			</div>
		</div>
	</section>
</main>

{#if isColumnDialogOpen}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 p-4">
		<div
			class="w-full max-w-sm rounded-md border border-slate-200 bg-white p-4 shadow-xl"
			role="dialog"
			aria-modal="true"
			aria-labelledby="column-dialog-title"
		>
			<div class="mb-4 flex items-center justify-between gap-3">
				<h2 id="column-dialog-title" class="text-base font-bold">
					{m.add_column()}
				</h2>
			</div>

			<label class="mb-2 block text-sm font-semibold text-slate-700" for="column-type">
				{m.column_type()}
			</label>
			<select
				id="column-type"
				class="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-950 transition outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
				bind:value={selectedSourceKey}
			>
				{#each columnSourceKeys as sourceKey (sourceKey)}
					<option value={sourceKey}>{m[sourceKey]()}</option>
				{/each}
			</select>

			<div class="mt-5 flex justify-end gap-3">
				<div class="flex gap-2">
					<button
						type="button"
						class="h-9 rounded-md px-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-100"
						onclick={closeColumnDialog}
					>
						{m.cancel()}
					</button>
					<button
						type="button"
						class="h-9 rounded-md bg-sky-500 px-3 text-sm font-semibold text-white transition hover:bg-sky-600"
						onclick={saveColumnDialog}
					>
						{m.save()}
					</button>
				</div>
			</div>
		</div>
	</div>
{/if}
