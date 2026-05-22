<script lang="ts">
	import {
		Bell,
		Bookmark,
		House,
		Languages,
		PawPrint,
		PanelLeftClose,
		PanelLeftOpen,
		Search,
		Send,
		Settings,
		UserRound
	} from '@lucide/svelte';
	import { m } from '$lib/paraglide/messages.js';
	import { getLocale, locales, setLocale } from '$lib/paraglide/runtime.js';
	import type { MessageKey } from '$lib/deck/types';

	type AppLocale = (typeof locales)[number];

	const currentLocale = getLocale();
	let isCollapsed = $state(false);

	const localeLabels: Record<AppLocale, string> = {
		en: 'EN',
		ja: 'JA'
	};

	const navItems = [
		{ labelKey: 'nav_home', icon: House, active: true },
		{ labelKey: 'nav_search', icon: Search },
		{ labelKey: 'nav_notifications', icon: Bell, badge: '8' },
		{ labelKey: 'nav_bookmarks', icon: Bookmark },
		{ labelKey: 'nav_settings', icon: Settings }
	] satisfies Array<{
		labelKey: MessageKey;
		icon: typeof House;
		active?: boolean;
		badge?: string;
	}>;

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
</script>

<aside
	class={[
		'flex shrink-0 flex-col border-r border-slate-200 bg-white/95 px-2 py-4 transition-[width] duration-200 ease-out',
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

	<nav class="flex w-full flex-col gap-1" aria-label={m.app_title()}>
		{#each navItems as item (item.labelKey)}
			<button
				type="button"
				class={[
					'group flex h-11 w-full items-center rounded-md text-sm font-medium transition',
					item.active ? 'text-sky-700' : 'text-slate-700 hover:text-slate-950',
					!isCollapsed && item.active ? 'bg-sky-50' : '',
					!isCollapsed && !item.active ? 'hover:bg-slate-100' : ''
				]}
				title={m[item.labelKey]()}
				aria-label={m[item.labelKey]()}
			>
				<span
					class={[
						'flex size-11 shrink-0 items-center justify-center rounded-md transition',
						isCollapsed && item.active ? 'bg-sky-50 text-sky-700' : '',
						isCollapsed && !item.active ? 'group-hover:bg-slate-100 group-hover:text-slate-950' : ''
					]}
				>
					<item.icon class="size-5 shrink-0" aria-hidden="true" />
				</span>
				<span class={`${sidebarLabelClass()} flex-1 truncate text-left`}>
					{m[item.labelKey]()}
				</span>
				{#if item.badge}
					<span class={sidebarBadgeClass()}>
						<span
							class="mr-2 rounded-full bg-sky-500 px-1.5 py-0.5 text-[11px] leading-none font-semibold text-white"
						>
							{item.badge}
						</span>
					</span>
				{/if}
			</button>
		{/each}
	</nav>

	<button
		type="button"
		class={[
			'group mt-4 flex h-11 w-full items-center rounded-md text-sm font-bold text-white transition',
			isCollapsed ? '' : 'bg-sky-500 shadow-sm hover:bg-sky-600'
		]}
		title={m.action_post()}
		aria-label={m.action_post()}
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

	<div class="mt-5 w-full border-t border-slate-200 pt-4">
		<div
			class={[
				'mb-2 flex items-center gap-2 overflow-hidden px-2 text-xs font-semibold text-slate-500 uppercase transition-all duration-150 ease-out',
				isCollapsed ? 'h-0 max-w-0 opacity-0' : 'h-4 max-w-[150px] opacity-100'
			]}
		>
			<Languages class="size-4" aria-hidden="true" />
			<span>{m.language_switcher()}</span>
		</div>
		<div
			class={[
				'grid gap-1 transition-all duration-150 ease-out',
				isCollapsed ? 'grid-cols-1 justify-items-center' : 'grid-cols-2'
			]}
		>
			{#each locales as locale (locale)}
				<button
					type="button"
					class={[
						'h-9 rounded-md border text-xs font-bold transition',
						isCollapsed ? 'w-11' : '',
						currentLocale === locale
							? 'border-sky-500 bg-sky-50 text-sky-700'
							: 'border-slate-200 text-slate-600 hover:bg-slate-50'
					]}
					onclick={() => setLocale(locale)}
					aria-pressed={currentLocale === locale}
				>
					{localeLabels[locale]}
				</button>
			{/each}
		</div>
	</div>

	<div class="mt-auto flex w-full flex-col gap-2">
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
