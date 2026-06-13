<script lang="ts">
	import { getColumnTitle } from '$lib/deck/column-title';
	import type { ColumnConfig } from '$lib/deck/types';
	import type { FontSizeTextClasses } from '$lib/font-size';
	import { m } from '$lib/paraglide/messages.js';
	import ColumnIcon from './ColumnIcon.svelte';

	type Props = {
		columns: ColumnConfig[];
		activeColumnId: string;
		isCollapsed: boolean;
		textClass: FontSizeTextClasses;
		onSelectColumn: (columnId: string) => void;
		onReorderColumn: (columnId: string, targetIndex: number) => void;
	};

	const {
		columns,
		activeColumnId,
		isCollapsed,
		textClass,
		onSelectColumn,
		onReorderColumn
	}: Props = $props();
	let draggedColumnId = $state<string | null>(null);
	let dropTarget = $state<{ columnId: string; position: 'before' | 'after' } | null>(null);

	const sidebarLabelClass = () =>
		[
			'min-w-0 overflow-hidden whitespace-nowrap transition-all duration-150 ease-out',
			isCollapsed ? 'max-w-0 opacity-0' : 'max-w-[150px] opacity-100'
		].join(' ');

	function startColumnDrag(event: DragEvent, columnId: string) {
		draggedColumnId = columnId;
		dropTarget = null;
		event.dataTransfer?.setData('text/plain', columnId);
		if (event.dataTransfer) {
			event.dataTransfer.effectAllowed = 'move';
		}
	}

	function updateColumnDropTarget(event: DragEvent, columnId: string) {
		if (!draggedColumnId || draggedColumnId === columnId) {
			dropTarget = null;
			return;
		}

		event.preventDefault();
		if (event.dataTransfer) {
			event.dataTransfer.dropEffect = 'move';
		}

		const target = event.currentTarget as HTMLElement;
		const bounds = target.getBoundingClientRect();
		const position = event.clientY < bounds.top + bounds.height / 2 ? 'before' : 'after';
		dropTarget = { columnId, position };
	}

	function dropColumn(event: DragEvent, columnId: string) {
		event.preventDefault();
		if (!draggedColumnId || draggedColumnId === columnId || dropTarget?.columnId !== columnId) {
			clearColumnDrag();
			return;
		}

		const dropIndex = columns.findIndex((column) => column.id === columnId);
		if (dropIndex >= 0) {
			onReorderColumn(draggedColumnId, dropIndex + (dropTarget.position === 'after' ? 1 : 0));
		}
		clearColumnDrag();
	}

	function clearColumnDrag() {
		draggedColumnId = null;
		dropTarget = null;
	}
</script>

<nav class="flex w-full flex-col gap-1" aria-label={m.app_title()}>
	{#each columns as column (column.id)}
		{@const isActive = activeColumnId === column.id}
		{@const columnTitle = getColumnTitle(column)}
		<button
			type="button"
			data-testid="sidebar-column"
			data-column-id={column.id}
			class={[
				'group relative flex h-11 w-full items-center rounded-md font-medium transition',
				textClass.control,
				isActive ? 'bg-white/10 text-white' : 'text-slate-400 hover:bg-white/10 hover:text-white',
				draggedColumnId === column.id ? 'opacity-50' : '',
				dropTarget?.columnId === column.id && dropTarget.position === 'before'
					? 'before:absolute before:inset-x-1 before:top-0 before:h-0.5 before:rounded-full before:bg-sky-500'
					: '',
				dropTarget?.columnId === column.id && dropTarget.position === 'after'
					? 'after:absolute after:inset-x-1 after:bottom-0 after:h-0.5 after:rounded-full after:bg-sky-500'
					: ''
			]}
			title={columnTitle}
			aria-label={columnTitle}
			aria-current={isActive ? 'page' : undefined}
			onclick={() => onSelectColumn(column.id)}
			ondragover={(event) => updateColumnDropTarget(event, column.id)}
			ondrop={(event) => dropColumn(event, column.id)}
		>
			<div
				data-testid="sidebar-column-active-indicator"
				class={[
					'pointer-events-none absolute top-1 bottom-1 left-0 w-[3px] rounded-full transition-colors',
					isActive ? 'bg-sky-400' : 'bg-transparent'
				]}
				aria-hidden="true"
			></div>
			<span
				draggable="true"
				role="presentation"
				data-testid="sidebar-column-drag-handle"
				class={[
					'flex size-11 shrink-0 cursor-grab items-center justify-center rounded-md transition active:cursor-grabbing',
					isActive ? 'text-sky-300' : '',
					isCollapsed && !isActive ? 'group-hover:text-white' : ''
				]}
				ondragstart={(event) => startColumnDrag(event, column.id)}
				ondragend={clearColumnDrag}
			>
				<ColumnIcon {column} iconClass="size-5 shrink-0" />
			</span>
			<span class={`${sidebarLabelClass()} flex-1 truncate text-left`}>
				{columnTitle}
			</span>
		</button>
	{/each}
</nav>
