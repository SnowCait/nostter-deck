<script lang="ts">
	import { PanelLeftClose, PanelLeftOpen, Plus, Send, Settings, UserRound } from '@lucide/svelte';
	import { m } from '$lib/paraglide/messages.js';
	import { getColumnTitle } from '$lib/deck/column-title';
	import type { Column } from '$lib/deck/types';
	import type { FontSizeTextClasses } from '$lib/font-size';
	import type * as Nostr from 'nostr-typedef';
	import { readUiState, updateUiState } from '$lib/ui-state';
	import type { AvatarShape, FontSize } from '$lib/user-settings';
	import ColumnIcon from './ColumnIcon.svelte';
	import ProfileAvatar from './ProfileAvatar.svelte';
	import SettingsDialog from './SettingsDialog.svelte';

	type Props = {
		columns: Column[];
		activeColumnId: string;
		isLoggedIn: boolean;
		onAddColumn: () => void;
		onCompose: () => void;
		fontSize: FontSize;
		avatarShape: AvatarShape;
		textClass: FontSizeTextClasses;
		onFontSizeChange: (fontSize: FontSize) => void;
		onAvatarShapeChange: (avatarShape: AvatarShape) => void;
		onSelectColumn: (columnId: string) => void;
		onReorderColumn: (columnId: string, targetIndex: number) => void;
		mutedPubkeys: string[];
		getProfile: (pubkey: string) => Nostr.Content.Metadata | undefined;
		requestProfiles: (pubkeys: string[], relays: string[]) => void;
		profileRelays: string[];
		onUnmuteUser: (pubkey: string) => void;
	};

	const {
		columns,
		activeColumnId,
		isLoggedIn,
		onAddColumn,
		onCompose,
		fontSize,
		avatarShape,
		textClass,
		onFontSizeChange,
		onAvatarShapeChange,
		onSelectColumn,
		onReorderColumn,
		mutedPubkeys,
		getProfile,
		requestProfiles,
		profileRelays,
		onUnmuteUser
	}: Props = $props();
	let isCollapsed = $state(readUiState().sidebarCollapsed);
	let isSettingsDialogOpen = $state(false);
	let draggedColumnId = $state<string | null>(null);
	let dropTarget = $state<{ columnId: string; position: 'before' | 'after' } | null>(null);

	const sidebarToggleLabel = () => (isCollapsed ? m.expand_sidebar() : m.collapse_sidebar());
	const sidebarLabelClass = () =>
		[
			'min-w-0 overflow-hidden whitespace-nowrap transition-all duration-150 ease-out',
			isCollapsed ? 'max-w-0 opacity-0' : 'max-w-[150px] opacity-100'
		].join(' ');

	function toggleSidebar() {
		const nextIsCollapsed = !isCollapsed;
		isCollapsed = nextIsCollapsed;
		updateUiState((currentState) => ({
			...currentState,
			sidebarCollapsed: nextIsCollapsed
		}));
	}

	function openSettingsDialog() {
		isSettingsDialogOpen = true;
	}

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

<aside
	class={[
		'flex h-full min-h-0 shrink-0 flex-col overflow-y-auto overscroll-contain border-r border-slate-200 bg-white/95 px-2 py-4 transition-[width] duration-200 ease-out dark:border-slate-800 dark:bg-slate-950/95',
		isCollapsed ? 'w-[60px]' : 'w-[236px]'
	]}
>
	<div class="mb-5 flex w-full items-center">
		<div class="flex w-11 shrink-0 justify-center">
			<div class="flex size-10 items-center justify-center rounded-md">
				<img src="/favicon.svg" alt="" class="size-7" aria-hidden="true" />
			</div>
		</div>
		<div class={sidebarLabelClass()}>
			<h1 class={['flex min-w-0 items-center', textClass.title]}>
				<img src="/logo.svg" alt={m.app_title()} class="h-7 max-w-[150px] dark:invert" />
			</h1>
		</div>
	</div>

	{#if isLoggedIn}
		<button
			type="button"
			class={[
				'group mb-4 flex h-11 w-full items-center rounded-md font-bold text-white transition',
				textClass.control,
				isCollapsed ? '' : 'bg-sky-500 shadow-sm hover:bg-sky-600'
			]}
			title={m.action_post()}
			aria-label={m.action_post()}
			onclick={onCompose}
		>
			<span
				class={[
					'flex size-11 shrink-0 items-center justify-center rounded-md transition',
					isCollapsed ? 'bg-sky-500 shadow-sm group-hover:bg-sky-600' : ''
				]}
			>
				<Send class="size-4" aria-hidden="true" />
			</span>
			<span class={`${sidebarLabelClass()} truncate text-left`}>
				{m.action_post()}
			</span>
		</button>
	{/if}

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
					isActive
						? 'text-sky-700 dark:text-sky-300'
						: 'text-slate-700 hover:text-slate-950 dark:text-slate-300 dark:hover:text-white',
					!isCollapsed && isActive ? 'bg-sky-50 dark:bg-sky-950/50' : '',
					!isCollapsed && !isActive ? 'hover:bg-slate-100 dark:hover:bg-slate-900' : '',
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
				<span
					draggable="true"
					role="presentation"
					data-testid="sidebar-column-drag-handle"
					class={[
						'flex size-11 shrink-0 cursor-grab items-center justify-center rounded-md transition active:cursor-grabbing',
						isCollapsed && isActive
							? 'bg-sky-50 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300'
							: '',
						isCollapsed && !isActive
							? 'group-hover:bg-slate-100 group-hover:text-slate-950 dark:group-hover:bg-slate-900 dark:group-hover:text-white'
							: ''
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

	<div class="my-3 w-full border-t border-slate-200 dark:border-slate-800" aria-hidden="true"></div>

	<button
		type="button"
		class={[
			'group flex h-11 w-full items-center rounded-md font-medium text-slate-600 transition hover:text-slate-950 dark:text-slate-400 dark:hover:text-white',
			textClass.control,
			isCollapsed ? '' : 'hover:bg-slate-100 dark:hover:bg-slate-900'
		]}
		title={m.add_column()}
		aria-label={m.add_column()}
		onclick={onAddColumn}
	>
		<span
			class={[
				'flex size-11 shrink-0 items-center justify-center rounded-md transition',
				isCollapsed ? 'group-hover:bg-slate-100 dark:group-hover:bg-slate-900' : ''
			]}
		>
			<Plus class="size-5 shrink-0" aria-hidden="true" />
		</span>
		<span class={`${sidebarLabelClass()} truncate text-left`}>
			{m.add_column()}
		</span>
	</button>

	<div class="mt-auto flex w-full flex-col gap-2">
		<button
			type="button"
			class={[
				'group flex h-11 w-full items-center rounded-md font-medium text-slate-600 transition hover:text-slate-950 dark:text-slate-400 dark:hover:text-white',
				textClass.control,
				isCollapsed ? '' : 'hover:bg-slate-100 dark:hover:bg-slate-900'
			]}
			title={sidebarToggleLabel()}
			aria-label={sidebarToggleLabel()}
			aria-pressed={isCollapsed}
			onclick={toggleSidebar}
		>
			<span
				class={[
					'flex size-11 shrink-0 items-center justify-center rounded-md transition',
					isCollapsed ? 'group-hover:bg-slate-100 dark:group-hover:bg-slate-900' : ''
				]}
			>
				{#if isCollapsed}
					<PanelLeftOpen class="size-5 shrink-0" aria-hidden="true" />
				{:else}
					<PanelLeftClose class="size-5 shrink-0" aria-hidden="true" />
				{/if}
			</span>
			<span class={`${sidebarLabelClass()} truncate text-left`}>
				{m.collapse_sidebar()}
			</span>
		</button>

		<button
			type="button"
			class={[
				'group flex h-11 w-full items-center rounded-md font-medium text-slate-600 transition hover:text-slate-950 dark:text-slate-400 dark:hover:text-white',
				textClass.control,
				isCollapsed ? '' : 'hover:bg-slate-100 dark:hover:bg-slate-900'
			]}
			title={m.nav_settings()}
			aria-label={m.nav_settings()}
			onclick={openSettingsDialog}
		>
			<span
				class={[
					'flex size-11 shrink-0 items-center justify-center rounded-md transition',
					isCollapsed ? 'group-hover:bg-slate-100 dark:group-hover:bg-slate-900' : ''
				]}
			>
				<Settings class="size-5 shrink-0" aria-hidden="true" />
			</span>
			<span class={`${sidebarLabelClass()} truncate text-left`}>
				{m.nav_settings()}
			</span>
		</button>

		{#if isLoggedIn}
			<div
				class={[
					'flex h-11 w-full items-center rounded-md border border-slate-200 transition dark:border-slate-800',
					isCollapsed ? 'border-0' : ''
				]}
			>
				<div class="flex w-11 shrink-0 justify-center">
					<ProfileAvatar
						shape={avatarShape}
						sizeClass="size-9"
						fallbackClass="bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-950"
						testId="account-avatar"
					>
						<UserRound class="size-4" aria-hidden="true" />
					</ProfileAvatar>
				</div>
				<div class={sidebarLabelClass()}>
					<p class={['truncate font-semibold', textClass.account]}>Mika</p>
					<p class={['truncate text-slate-500 dark:text-slate-400', textClass.meta]}>
						{m.account_role()}
					</p>
				</div>
			</div>
		{/if}
	</div>
</aside>

<SettingsDialog
	bind:isOpen={isSettingsDialogOpen}
	{fontSize}
	{avatarShape}
	{textClass}
	{onFontSizeChange}
	{onAvatarShapeChange}
	{mutedPubkeys}
	{getProfile}
	{requestProfiles}
	{profileRelays}
	{onUnmuteUser}
/>
