<script lang="ts">
	import DeckColumn from '$lib/components/deck/DeckColumn.svelte';
	import Sidebar from '$lib/components/deck/Sidebar.svelte';
	import { columns } from '$lib/deck/data';
	import type { ColumnTitleKey } from '$lib/deck/types';
	import { m } from '$lib/paraglide/messages.js';

	let activeColumn = $state<ColumnTitleKey>(columns[0]?.titleKey ?? 'timeline_home');

	function getColumnId(columnTitleKey: ColumnTitleKey) {
		return `deck-column-${columnTitleKey}`;
	}

	function focusColumn(columnTitleKey: ColumnTitleKey) {
		activeColumn = columnTitleKey;

		const columnElement = document.getElementById(getColumnId(columnTitleKey));
		columnElement?.scrollIntoView({
			behavior: 'smooth',
			block: 'nearest',
			inline: 'start'
		});
		columnElement?.focus({ preventScroll: true });
	}
</script>

<svelte:head>
	<title>{m.app_title()}</title>
</svelte:head>

<main class="flex h-screen min-h-0 bg-[#eef3f7] text-slate-950">
	<Sidebar {activeColumn} onSelectColumn={focusColumn} />

	<section class="flex min-w-0 flex-1 flex-col">
		<div class="min-h-0 flex-1 overflow-x-auto overflow-y-hidden">
			<div class="flex h-full min-w-max">
				{#each columns as column (column.titleKey)}
					<DeckColumn
						{column}
						id={getColumnId(column.titleKey)}
						isFocused={activeColumn === column.titleKey}
					/>
				{/each}
			</div>
		</div>
	</section>
</main>
