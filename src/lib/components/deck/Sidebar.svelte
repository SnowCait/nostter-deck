<script lang="ts">
	import {
		Bell,
		House,
		Languages,
		List,
		PawPrint,
		PanelLeftClose,
		PanelLeftOpen,
		Plus,
		Search,
		Send,
		Settings,
		UserRound
	} from '@lucide/svelte';
	import { m } from '$lib/paraglide/messages.js';
	import { getLocale, locales, setLocale } from '$lib/paraglide/runtime.js';
	import type { Column, ColumnSourceKey } from '$lib/deck/types';

	type AppLocale = (typeof locales)[number];
	type Props = {
		columns: Pick<Column, 'id' | 'sourceKey'>[];
		activeColumnId: string;
		onAddColumn: () => void;
		onCompose: () => void;
		onSelectColumn: (columnId: string) => void;
	};

	const { columns, activeColumnId, onAddColumn, onCompose, onSelectColumn }: Props = $props();
	const currentLocale = getLocale();
	let isCollapsed = $state(false);
	let isSettingsDialogOpen = $state(false);

	const localeLabels: Record<AppLocale, string> = {
		en: 'EN',
		ja: 'JA'
	};

	const columnIconBySource = {
		timeline_home: House,
		timeline_mentions: Bell,
		timeline_search: Search,
		timeline_lists: List
	} satisfies Record<ColumnSourceKey, typeof House>;

	const sidebarToggleLabel = () => (isCollapsed ? m.expand_sidebar() : m.collapse_sidebar());
	const sidebarLabelClass = () =>
		[
			'min-w-0 overflow-hidden whitespace-nowrap transition-all duration-150 ease-out',
			isCollapsed ? 'max-w-0 opacity-0' : 'max-w-[150px] opacity-100'
		].join(' ');
	const sidebarBadgeClass = () =>
		[
			'overflow-hidden transition-all duration-150 ease-out',
			isCollapsed ? 'max-w-0 opacity-0' : 'max-w-10 opacity-100'
		].join(' ');

	function toggleSidebar() {
		isCollapsed = !isCollapsed;
	}

	function openSettingsDialog() {
		isSettingsDialogOpen = true;
	}

	function closeSettingsDialog() {
		isSettingsDialogOpen = false;
	}

	function selectLocale(event: Event) {
		const selectedLocale = (event.currentTarget as HTMLSelectElement).value as AppLocale;
		setLocale(selectedLocale);
	}
</script>

<aside
	class={[
		'flex min-h-0 shrink-0 flex-col border-r border-slate-200 bg-white/95 px-2 py-4 transition-[width] duration-200 ease-out',
		isCollapsed ? 'w-[60px]' : 'w-[236px]'
	]}
>
	<div class="mb-5 flex w-full items-center">
		<div class="flex w-11 shrink-0 justify-center">
			<div class="flex size-10 items-center justify-center rounded-md bg-sky-500 text-white">
				<PawPrint class="size-5" aria-hidden="true" />
			</div>
		</div>
		<div class={sidebarLabelClass()}>
			<h1 class="truncate text-base font-bold">
				{m.app_title()}
			</h1>
		</div>
	</div>

	<button
		type="button"
		class={[
			'group mb-4 flex h-11 w-full items-center rounded-md text-sm font-bold text-white transition',
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

	<nav class="flex w-full flex-col gap-1" aria-label={m.app_title()}>
		{#each columns as column (column.id)}
			{@const isActive = activeColumnId === column.id}
			{@const ColumnIcon = columnIconBySource[column.sourceKey]}
			<button
				type="button"
				class={[
					'group flex h-11 w-full items-center rounded-md text-sm font-medium transition',
					isActive ? 'text-sky-700' : 'text-slate-700 hover:text-slate-950',
					!isCollapsed && isActive ? 'bg-sky-50' : '',
					!isCollapsed && !isActive ? 'hover:bg-slate-100' : ''
				]}
				title={m[column.sourceKey]()}
				aria-label={m[column.sourceKey]()}
				aria-current={isActive ? 'page' : undefined}
				onclick={() => onSelectColumn(column.id)}
			>
				<span
					class={[
						'flex size-11 shrink-0 items-center justify-center rounded-md transition',
						isCollapsed && isActive ? 'bg-sky-50 text-sky-700' : '',
						isCollapsed && !isActive ? 'group-hover:bg-slate-100 group-hover:text-slate-950' : ''
					]}
				>
					<ColumnIcon class="size-5 shrink-0" aria-hidden="true" />
				</span>
				<span class={`${sidebarLabelClass()} flex-1 truncate text-left`}>
					{m[column.sourceKey]()}
				</span>
				{#if column.sourceKey === 'timeline_mentions'}
					<span class={sidebarBadgeClass()}>
						<span
							class="mr-2 rounded-full bg-sky-500 px-1.5 py-0.5 text-[11px] leading-none font-semibold text-white"
						>
							8
						</span>
					</span>
				{/if}
			</button>
		{/each}
	</nav>

	<button
		type="button"
		class={[
			'group mt-3 flex h-11 w-full items-center rounded-md text-sm font-medium text-slate-600 transition hover:text-slate-950',
			isCollapsed ? '' : 'hover:bg-slate-100'
		]}
		title={m.add_column()}
		aria-label={m.add_column()}
		onclick={onAddColumn}
	>
		<span
			class={[
				'flex size-11 shrink-0 items-center justify-center rounded-md transition',
				isCollapsed ? 'group-hover:bg-slate-100' : ''
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
				'group flex h-11 w-full items-center rounded-md text-sm font-medium text-slate-600 transition hover:text-slate-950',
				isCollapsed ? '' : 'hover:bg-slate-100'
			]}
			title={m.nav_settings()}
			aria-label={m.nav_settings()}
			onclick={openSettingsDialog}
		>
			<span
				class={[
					'flex size-11 shrink-0 items-center justify-center rounded-md transition',
					isCollapsed ? 'group-hover:bg-slate-100' : ''
				]}
			>
				<Settings class="size-5 shrink-0" aria-hidden="true" />
			</span>
			<span class={`${sidebarLabelClass()} truncate text-left`}>
				{m.nav_settings()}
			</span>
		</button>

		<button
			type="button"
			class={[
				'group flex h-11 w-full items-center rounded-md text-sm font-medium text-slate-600 transition hover:text-slate-950',
				isCollapsed ? '' : 'hover:bg-slate-100'
			]}
			title={sidebarToggleLabel()}
			aria-label={sidebarToggleLabel()}
			aria-pressed={isCollapsed}
			onclick={toggleSidebar}
		>
			<span
				class={[
					'flex size-11 shrink-0 items-center justify-center rounded-md transition',
					isCollapsed ? 'group-hover:bg-slate-100' : ''
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

		<div
			class={[
				'flex h-11 w-full items-center rounded-md border border-slate-200 transition',
				isCollapsed ? 'border-0' : ''
			]}
		>
			<div class="flex w-11 shrink-0 justify-center">
				<div
					class="flex size-9 shrink-0 items-center justify-center rounded-md bg-slate-900 text-white"
				>
					<UserRound class="size-4" aria-hidden="true" />
				</div>
			</div>
			<div class={sidebarLabelClass()}>
				<p class="truncate text-sm font-semibold">Mika</p>
				<p class="truncate text-xs text-slate-500">
					{m.account_role()}
				</p>
			</div>
		</div>
	</div>
</aside>

{#if isSettingsDialogOpen}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 p-4">
		<div
			class="w-full max-w-sm rounded-md border border-slate-200 bg-white p-4 shadow-xl"
			role="dialog"
			aria-modal="true"
			aria-labelledby="settings-dialog-title"
		>
			<div class="mb-4 flex items-center justify-between gap-3">
				<div class="flex min-w-0 items-center gap-2">
					<Settings class="size-4 shrink-0 text-slate-500" aria-hidden="true" />
					<h2 id="settings-dialog-title" class="min-w-0 truncate text-base font-bold">
						{m.nav_settings()}
					</h2>
				</div>
				<button
					type="button"
					class="h-9 rounded-md px-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-100"
					onclick={closeSettingsDialog}
				>
					{m.close()}
				</button>
			</div>

			<label class="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-700" for="locale">
				<Languages class="size-4 shrink-0 text-slate-500" aria-hidden="true" />
				<span>{m.language_switcher()}</span>
			</label>
			<select
				id="locale"
				class="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-950 transition outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
				value={currentLocale}
				onchange={selectLocale}
			>
				{#each locales as locale (locale)}
					<option value={locale}>{localeLabels[locale]}</option>
				{/each}
			</select>
		</div>
	</div>
{/if}
