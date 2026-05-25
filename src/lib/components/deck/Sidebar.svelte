<script lang="ts">
	import {
		CircleUserRound,
		Languages,
		PawPrint,
		PanelLeftClose,
		PanelLeftOpen,
		Plus,
		Send,
		Settings,
		SlidersHorizontal,
		SunMoon,
		UserRound
	} from '@lucide/svelte';
	import { m } from '$lib/paraglide/messages.js';
	import { getLocale, locales, setLocale } from '$lib/paraglide/runtime.js';
	import { getColumnTitle } from '$lib/deck/column-title';
	import * as Dialog from '$lib/components/ui/dialog';
	import type { Column } from '$lib/deck/types';
	import type { FontSizeTextClasses } from '$lib/font-size';
	import { readUiState, updateUiState } from '$lib/ui-state';
	import {
		applyThemePreference,
		avatarShapePreferences,
		fontSizePreferences,
		readUserSettings,
		themePreferences,
		updateUserSettings,
		type AvatarShape,
		type FontSize,
		type ThemePreference
	} from '$lib/user-settings';
	import ColumnIcon from './ColumnIcon.svelte';
	import ProfileAvatar from './ProfileAvatar.svelte';

	type AppLocale = (typeof locales)[number];
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
		onSelectColumn
	}: Props = $props();
	const currentLocale = getLocale();
	let isCollapsed = $state(readUiState().sidebarCollapsed);
	let themePreference = $state(readUserSettings().theme);
	let isSettingsDialogOpen = $state(false);

	const localeLabels: Record<AppLocale, string> = {
		en: 'EN',
		ja: 'JA'
	};

	const themeLabels = {
		system: () => m.theme_system(),
		light: () => m.theme_light(),
		dark: () => m.theme_dark()
	} satisfies Record<ThemePreference, () => string>;

	const fontSizeLabels = {
		large: () => m.font_size_large(),
		medium: () => m.font_size_medium(),
		small: () => m.font_size_small()
	} satisfies Record<FontSize, () => string>;
	const avatarShapeLabels = {
		circle: () => m.avatar_shape_circle(),
		square: () => m.avatar_shape_square()
	} satisfies Record<AvatarShape, () => string>;

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

	function closeSettingsDialog() {
		isSettingsDialogOpen = false;
	}

	function selectLocale(event: Event) {
		const selectedLocale = (event.currentTarget as HTMLSelectElement).value as AppLocale;
		setLocale(selectedLocale);
	}

	function selectTheme(event: Event) {
		const selectedTheme = (event.currentTarget as HTMLSelectElement).value as ThemePreference;
		themePreference = selectedTheme;
		updateUserSettings((currentSettings) => ({
			...currentSettings,
			theme: selectedTheme
		}));
		applyThemePreference(selectedTheme);
	}

	function selectFontSize(event: Event) {
		const selectedFontSize = (event.currentTarget as HTMLSelectElement).value as FontSize;
		updateUserSettings((currentSettings) => ({
			...currentSettings,
			fontSize: selectedFontSize
		}));
		onFontSizeChange(selectedFontSize);
	}

	function selectAvatarShape(event: Event) {
		const selectedAvatarShape = (event.currentTarget as HTMLSelectElement).value as AvatarShape;
		updateUserSettings((currentSettings) => ({
			...currentSettings,
			avatarShape: selectedAvatarShape
		}));
		onAvatarShapeChange(selectedAvatarShape);
	}
</script>

<aside
	class={[
		'flex min-h-0 shrink-0 flex-col border-r border-slate-200 bg-white/95 px-2 py-4 transition-[width] duration-200 ease-out dark:border-slate-800 dark:bg-slate-950/95',
		isCollapsed ? 'w-[60px]' : 'w-[236px]'
	]}
>
	<div class="mb-5 flex w-full items-center">
		<div class="flex w-11 shrink-0 justify-center">
			<div
				class="flex size-10 items-center justify-center rounded-md bg-sky-500 text-white dark:bg-sky-400 dark:text-slate-950"
			>
				<PawPrint class="size-5" aria-hidden="true" />
			</div>
		</div>
		<div class={sidebarLabelClass()}>
			<h1 class={['truncate font-bold', textClass.title]}>
				{m.app_title()}
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
				class={[
					'group flex h-11 w-full items-center rounded-md font-medium transition',
					textClass.control,
					isActive
						? 'text-sky-700 dark:text-sky-300'
						: 'text-slate-700 hover:text-slate-950 dark:text-slate-300 dark:hover:text-white',
					!isCollapsed && isActive ? 'bg-sky-50 dark:bg-sky-950/50' : '',
					!isCollapsed && !isActive ? 'hover:bg-slate-100 dark:hover:bg-slate-900' : ''
				]}
				title={columnTitle}
				aria-label={columnTitle}
				aria-current={isActive ? 'page' : undefined}
				onclick={() => onSelectColumn(column.id)}
			>
				<span
					class={[
						'flex size-11 shrink-0 items-center justify-center rounded-md transition',
						isCollapsed && isActive
							? 'bg-sky-50 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300'
							: '',
						isCollapsed && !isActive
							? 'group-hover:bg-slate-100 group-hover:text-slate-950 dark:group-hover:bg-slate-900 dark:group-hover:text-white'
							: ''
					]}
				>
					<ColumnIcon {column} iconClass="size-5 shrink-0" />
				</span>
				<span class={`${sidebarLabelClass()} flex-1 truncate text-left`}>
					{columnTitle}
				</span>
				{#if column.type === 'timeline' && column.timelineKind === 'preset' && column.sourceKey === 'timeline_mentions'}
					<span class={sidebarBadgeClass()}>
						<span
							class="mr-2 rounded-full bg-sky-500 px-1.5 py-0.5 text-[11px] leading-none font-semibold text-white dark:bg-sky-400 dark:text-slate-950"
						>
							8
						</span>
					</span>
				{/if}
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

<Dialog.Root bind:open={isSettingsDialogOpen}>
	<Dialog.Content
		class="max-w-sm gap-0 rounded-md border border-slate-200 bg-white p-4 text-slate-950 shadow-xl ring-0 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-50"
		showCloseButton={false}
	>
		<div class="mb-4 flex items-center justify-between gap-3">
			<div class="flex min-w-0 items-center gap-2">
				<Settings class="size-4 shrink-0 text-slate-500 dark:text-slate-400" aria-hidden="true" />
				<Dialog.Title class={['min-w-0 truncate font-bold', textClass.title]}>
					{m.nav_settings()}
				</Dialog.Title>
			</div>
			<button
				type="button"
				class={[
					'h-9 rounded-md px-3 font-semibold text-slate-600 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-900',
					textClass.control
				]}
				onclick={closeSettingsDialog}
			>
				{m.close()}
			</button>
		</div>

		<section aria-labelledby="settings-general-title">
			<h3
				id="settings-general-title"
				class={[
					'mb-3 font-bold tracking-wide text-slate-500 uppercase dark:text-slate-400',
					textClass.section
				]}
			>
				{m.settings_general()}
			</h3>
			<label
				class={[
					'mb-2 flex items-center gap-2 font-semibold text-slate-700 dark:text-slate-300',
					textClass.label
				]}
				for="locale"
			>
				<Languages class="size-4 shrink-0 text-slate-500 dark:text-slate-400" aria-hidden="true" />
				<span>{m.language_switcher()}</span>
			</label>
			<select
				id="locale"
				class={[
					'h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-slate-950 transition outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50 dark:focus:border-sky-400 dark:focus:ring-sky-950',
					textClass.control
				]}
				value={currentLocale}
				onchange={selectLocale}
			>
				{#each locales as locale (locale)}
					<option value={locale}>{localeLabels[locale]}</option>
				{/each}
			</select>
		</section>

		<section class="mt-5" aria-labelledby="settings-appearance-title">
			<h3
				id="settings-appearance-title"
				class={[
					'mb-3 font-bold tracking-wide text-slate-500 uppercase dark:text-slate-400',
					textClass.section
				]}
			>
				{m.settings_appearance()}
			</h3>
			<label
				class={[
					'mb-2 flex items-center gap-2 font-semibold text-slate-700 dark:text-slate-300',
					textClass.label
				]}
				for="theme"
			>
				<SunMoon class="size-4 shrink-0 text-slate-500 dark:text-slate-400" aria-hidden="true" />
				<span>{m.theme_switcher()}</span>
			</label>
			<select
				id="theme"
				class={[
					'h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-slate-950 transition outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50 dark:focus:border-sky-400 dark:focus:ring-sky-950',
					textClass.control
				]}
				value={themePreference}
				onchange={selectTheme}
			>
				{#each themePreferences as theme (theme)}
					<option value={theme}>{themeLabels[theme]()}</option>
				{/each}
			</select>

			<label
				class={[
					'mt-4 mb-2 flex items-center gap-2 font-semibold text-slate-700 dark:text-slate-300',
					textClass.label
				]}
				for="font-size"
			>
				<SlidersHorizontal
					class="size-4 shrink-0 text-slate-500 dark:text-slate-400"
					aria-hidden="true"
				/>
				<span>{m.font_size_switcher()}</span>
			</label>
			<select
				id="font-size"
				class={[
					'h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-slate-950 transition outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50 dark:focus:border-sky-400 dark:focus:ring-sky-950',
					textClass.control
				]}
				value={fontSize}
				onchange={selectFontSize}
			>
				{#each fontSizePreferences as size (size)}
					<option value={size}>{fontSizeLabels[size]()}</option>
				{/each}
			</select>

			<label
				class={[
					'mt-4 mb-2 flex items-center gap-2 font-semibold text-slate-700 dark:text-slate-300',
					textClass.label
				]}
				for="avatar-shape"
			>
				<CircleUserRound
					class="size-4 shrink-0 text-slate-500 dark:text-slate-400"
					aria-hidden="true"
				/>
				<span>{m.avatar_shape_switcher()}</span>
			</label>
			<select
				id="avatar-shape"
				class={[
					'h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-slate-950 transition outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50 dark:focus:border-sky-400 dark:focus:ring-sky-950',
					textClass.control
				]}
				value={avatarShape}
				onchange={selectAvatarShape}
			>
				{#each avatarShapePreferences as shape (shape)}
					<option value={shape}>{avatarShapeLabels[shape]()}</option>
				{/each}
			</select>
		</section>
	</Dialog.Content>
</Dialog.Root>
