<script lang="ts">
	import {
		CircleUserRound,
		Languages,
		PanelLeftClose,
		PanelLeftOpen,
		Plus,
		Send,
		Settings,
		SlidersHorizontal,
		SunMoon,
		VolumeX,
		UserRound
	} from '@lucide/svelte';
	import { npubEncode } from 'nostr-tools/nip19';
	import { m } from '$lib/paraglide/messages.js';
	import { getLocale, locales, setLocale } from '$lib/paraglide/runtime.js';
	import { getColumnTitle } from '$lib/deck/column-title';
	import * as Dialog from '$lib/components/ui/dialog';
	import * as Select from '$lib/components/ui/select';
	import type { Column } from '$lib/deck/types';
	import type { FontSizeTextClasses } from '$lib/font-size';
	import type * as Nostr from 'nostr-typedef';
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
	let currentLocale = $state<AppLocale>(getLocale());
	let isCollapsed = $state(readUiState().sidebarCollapsed);
	let themePreference = $state(readUserSettings().theme);
	let isSettingsDialogOpen = $state(false);
	let draggedColumnId = $state<string | null>(null);
	let dropTarget = $state<{ columnId: string; position: 'before' | 'after' } | null>(null);

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
	const localeOptions = $derived(locales.map((value) => ({ value, label: localeLabels[value] })));
	const themeOptions = $derived(
		themePreferences.map((value) => ({ value, label: themeLabels[value]() }))
	);
	const fontSizeOptions = $derived(
		fontSizePreferences.map((value) => ({ value, label: fontSizeLabels[value]() }))
	);
	const avatarShapeOptions = $derived(
		avatarShapePreferences.map((value) => ({ value, label: avatarShapeLabels[value]() }))
	);
	const selectedLocaleLabel = $derived(
		localeOptions.find(({ value }) => value === currentLocale)?.label ?? ''
	);
	const selectedThemeLabel = $derived(
		themeOptions.find(({ value }) => value === themePreference)?.label ?? ''
	);
	const selectedFontSizeLabel = $derived(
		fontSizeOptions.find(({ value }) => value === fontSize)?.label ?? ''
	);
	const selectedAvatarShapeLabel = $derived(
		avatarShapeOptions.find(({ value }) => value === avatarShape)?.label ?? ''
	);

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

	$effect(() => {
		if (!isSettingsDialogOpen || mutedPubkeys.length === 0) return;
		requestProfiles(mutedPubkeys, profileRelays);
	});

	function closeSettingsDialog() {
		isSettingsDialogOpen = false;
	}

	function selectLocale(value: string) {
		const selectedLocale = value as AppLocale;
		currentLocale = selectedLocale;
		setLocale(selectedLocale);
	}

	function selectTheme(value: string) {
		const selectedTheme = value as ThemePreference;
		themePreference = selectedTheme;
		updateUserSettings((currentSettings) => ({
			...currentSettings,
			theme: selectedTheme
		}));
		applyThemePreference(selectedTheme);
	}

	function selectFontSize(value: string) {
		const selectedFontSize = value as FontSize;
		updateUserSettings((currentSettings) => ({
			...currentSettings,
			fontSize: selectedFontSize
		}));
		onFontSizeChange(selectedFontSize);
	}

	function selectAvatarShape(value: string) {
		const selectedAvatarShape = value as AvatarShape;
		updateUserSettings((currentSettings) => ({
			...currentSettings,
			avatarShape: selectedAvatarShape
		}));
		onAvatarShapeChange(selectedAvatarShape);
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

	function getMutedUserName(pubkey: string) {
		const profile = getProfile(pubkey);
		return profile?.display_name ?? profile?.name ?? npubEncode(pubkey).slice(0, 16);
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

<Dialog.Root bind:open={isSettingsDialogOpen}>
	<Dialog.Content
		class="max-h-[calc(100dvh-2rem)] max-w-sm gap-0 overflow-x-hidden overflow-y-auto overscroll-contain rounded-md border border-slate-200 bg-white p-4 text-slate-950 shadow-xl ring-0 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-50"
		showCloseButton={false}
		overlayProps={{ onclick: closeSettingsDialog }}
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
				id="locale-label"
				class={[
					'mb-2 flex items-center gap-2 font-semibold text-slate-700 dark:text-slate-300',
					textClass.label
				]}
				for="locale"
			>
				<Languages class="size-4 shrink-0 text-slate-500 dark:text-slate-400" aria-hidden="true" />
				<span>{m.language_switcher()}</span>
			</label>
			<Select.Root
				type="single"
				items={localeOptions}
				value={currentLocale}
				onValueChange={selectLocale}
			>
				<Select.Trigger
					id="locale"
					aria-labelledby="locale-label"
					class={[
						'h-10 w-full border-slate-300 bg-white px-3 text-slate-950 shadow-none focus-visible:border-sky-500 focus-visible:ring-2 focus-visible:ring-sky-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50 dark:hover:bg-slate-900 dark:focus-visible:border-sky-400 dark:focus-visible:ring-sky-950',
						textClass.control
					]}
				>
					<span class="truncate">{selectedLocaleLabel}</span>
				</Select.Trigger>
				<Select.Content class="z-[60]">
					{#each localeOptions as option (option.value)}
						<Select.Item value={option.value} label={option.label} />
					{/each}
				</Select.Content>
			</Select.Root>
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
				id="theme-label"
				class={[
					'mb-2 flex items-center gap-2 font-semibold text-slate-700 dark:text-slate-300',
					textClass.label
				]}
				for="theme"
			>
				<SunMoon class="size-4 shrink-0 text-slate-500 dark:text-slate-400" aria-hidden="true" />
				<span>{m.theme_switcher()}</span>
			</label>
			<Select.Root
				type="single"
				items={themeOptions}
				value={themePreference}
				onValueChange={selectTheme}
			>
				<Select.Trigger
					id="theme"
					aria-labelledby="theme-label"
					class={[
						'h-10 w-full border-slate-300 bg-white px-3 text-slate-950 shadow-none focus-visible:border-sky-500 focus-visible:ring-2 focus-visible:ring-sky-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50 dark:hover:bg-slate-900 dark:focus-visible:border-sky-400 dark:focus-visible:ring-sky-950',
						textClass.control
					]}
				>
					<span class="truncate">{selectedThemeLabel}</span>
				</Select.Trigger>
				<Select.Content class="z-[60]">
					{#each themeOptions as option (option.value)}
						<Select.Item value={option.value} label={option.label} />
					{/each}
				</Select.Content>
			</Select.Root>

			<label
				id="font-size-label"
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
			<Select.Root
				type="single"
				items={fontSizeOptions}
				value={fontSize}
				onValueChange={selectFontSize}
			>
				<Select.Trigger
					id="font-size"
					aria-labelledby="font-size-label"
					class={[
						'h-10 w-full border-slate-300 bg-white px-3 text-slate-950 shadow-none focus-visible:border-sky-500 focus-visible:ring-2 focus-visible:ring-sky-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50 dark:hover:bg-slate-900 dark:focus-visible:border-sky-400 dark:focus-visible:ring-sky-950',
						textClass.control
					]}
				>
					<span class="truncate">{selectedFontSizeLabel}</span>
				</Select.Trigger>
				<Select.Content class="z-[60]">
					{#each fontSizeOptions as option (option.value)}
						<Select.Item value={option.value} label={option.label} />
					{/each}
				</Select.Content>
			</Select.Root>

			<label
				id="avatar-shape-label"
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
			<Select.Root
				type="single"
				items={avatarShapeOptions}
				value={avatarShape}
				onValueChange={selectAvatarShape}
			>
				<Select.Trigger
					id="avatar-shape"
					aria-labelledby="avatar-shape-label"
					class={[
						'h-10 w-full border-slate-300 bg-white px-3 text-slate-950 shadow-none focus-visible:border-sky-500 focus-visible:ring-2 focus-visible:ring-sky-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50 dark:hover:bg-slate-900 dark:focus-visible:border-sky-400 dark:focus-visible:ring-sky-950',
						textClass.control
					]}
				>
					<span class="truncate">{selectedAvatarShapeLabel}</span>
				</Select.Trigger>
				<Select.Content class="z-[60]">
					{#each avatarShapeOptions as option (option.value)}
						<Select.Item value={option.value} label={option.label} />
					{/each}
				</Select.Content>
			</Select.Root>
		</section>

		<section class="mt-5 min-w-0" aria-labelledby="settings-muted-users-title">
			<h3
				id="settings-muted-users-title"
				class={[
					'mb-3 flex items-center gap-2 font-bold tracking-wide text-slate-500 uppercase dark:text-slate-400',
					textClass.section
				]}
			>
				<VolumeX class="size-4 shrink-0" aria-hidden="true" />
				<span>{m.settings_muted_users()}</span>
			</h3>
			{#if mutedPubkeys.length === 0}
				<p class={['text-slate-500 dark:text-slate-400', textClass.body]}>
					{m.muted_users_empty()}
				</p>
			{:else}
				<div class="flex w-full min-w-0 flex-col gap-2">
					{#each mutedPubkeys as pubkey (pubkey)}
						{@const profile = getProfile(pubkey)}
						{@const name = getMutedUserName(pubkey)}
						<div
							class="flex w-full min-w-0 items-center gap-3 rounded-md border border-slate-200 p-2 dark:border-slate-800"
						>
							<ProfileAvatar
								shape={avatarShape}
								sizeClass="size-9"
								imageUrl={profile?.picture}
								fallbackText={name.slice(0, 1)}
								fallbackClass="bg-slate-500 text-sm font-bold text-white"
							/>
							<div class="min-w-0 flex-1">
								<p class={['truncate font-semibold', textClass.account]}>{name}</p>
								<p class={['truncate text-slate-500 dark:text-slate-400', textClass.meta]}>
									{npubEncode(pubkey)}
								</p>
							</div>
							<button
								type="button"
								class={[
									'shrink-0 rounded-md px-2 py-1 font-semibold text-sky-600 transition hover:bg-sky-50 focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:outline-none dark:text-sky-300 dark:hover:bg-sky-950/40',
									textClass.meta
								]}
								aria-label={m.unmute_user({ name })}
								title={m.unmute_user({ name })}
								onclick={() => onUnmuteUser(pubkey)}
							>
								{m.unmute()}
							</button>
						</div>
					{/each}
				</div>
			{/if}
		</section>
	</Dialog.Content>
</Dialog.Root>
