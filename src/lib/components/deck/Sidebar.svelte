<script lang="ts">
	import { PanelLeftClose, PanelLeftOpen, Plus, Send, Settings } from '@lucide/svelte';
	import { m } from '$lib/paraglide/messages.js';
	import type { ColumnConfig } from '$lib/deck/types';
	import type { FontSizeTextClasses } from '$lib/font-size';
	import type { AuthState } from '$lib/nostr/auth.svelte';
	import type { AccountRecord } from '$lib/nostr/accounts';
	import type { Profile } from '$lib/nostr/profiles';
	import { readUiState, updateUiState } from '$lib/ui-state';
	import type { AvatarShape, FontSize } from '$lib/user-settings';
	import AccountMenu from './AccountMenu.svelte';
	import SidebarColumnList from './SidebarColumnList.svelte';
	import SettingsDialog from './SettingsDialog.svelte';

	type Props = {
		columns: ColumnConfig[];
		activeColumnId: string;
		isLoggedIn: boolean;
		authState: AuthState;
		accountPubkey: string | null;
		accountProfile: Profile | undefined;
		onLogin: () => Promise<boolean>;
		accounts: AccountRecord[];
		activeAccountId: string | null;
		onSelectAccount: (accountId: string) => Promise<boolean>;
		onRemoveAccount: (accountId: string) => Promise<boolean>;
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
		getProfile: (pubkey: string) => Profile | undefined;
		requestProfiles: (pubkeys: string[], relays: string[]) => void;
		profileRelays: string[];
		onUnmuteUser: (pubkey: string) => void;
	};

	const {
		columns,
		activeColumnId,
		isLoggedIn,
		authState,
		accountPubkey,
		accountProfile,
		onLogin,
		accounts,
		activeAccountId,
		onSelectAccount,
		onRemoveAccount,
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
</script>

<aside
	class={[
		'flex h-full min-h-0 shrink-0 flex-col overflow-y-auto overscroll-contain border-r border-slate-800 bg-slate-950 px-2 py-4 text-slate-100 transition-[width] duration-200 ease-out',
		isCollapsed ? 'w-[60px]' : 'w-[236px]'
	]}
>
	<div class="mb-5 flex w-full items-center">
		<div class="flex w-11 shrink-0 justify-center">
			<div class="flex size-10 items-center justify-center rounded-md">
				<img src="/favicon.svg" alt="" class="size-7" aria-hidden="true" />
				<img src="/favicon.svg" alt="" class="size-7" aria-hidden="true" />
			</div>
		</div>
		<div class={sidebarLabelClass()}>
			<h1 class={['flex min-w-0 items-center', textClass.title]}>
				<img src="/logo.svg" alt={m.app_title()} class="h-7 max-w-[150px] invert" />
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
			<span class={`${sidebarLabelClass()} truncate text-left`}>{m.action_post()}</span>
		</button>
	{/if}

	<SidebarColumnList
		{columns}
		{activeColumnId}
		{isCollapsed}
		{textClass}
		{onSelectColumn}
		{onReorderColumn}
	/>

	<div class="my-3 w-full border-t border-slate-800" aria-hidden="true"></div>

	<button
		type="button"
		class={[
			'group flex h-11 w-full items-center rounded-md font-medium text-slate-400 transition hover:text-white',
			textClass.control,
			isCollapsed ? '' : 'hover:bg-white/10'
		]}
		title={m.add_column()}
		aria-label={m.add_column()}
		onclick={onAddColumn}
	>
		<span
			class={[
				'flex size-11 shrink-0 items-center justify-center rounded-md transition',
				isCollapsed ? 'group-hover:bg-white/10' : ''
			]}
		>
			<Plus class="size-5 shrink-0" aria-hidden="true" />
		</span>
		<span class={`${sidebarLabelClass()} truncate text-left`}>{m.add_column()}</span>
	</button>

	<div class="mt-auto flex w-full flex-col gap-2">
		<button
			type="button"
			class={[
				'group flex h-11 w-full items-center rounded-md font-medium text-slate-400 transition hover:text-white',
				textClass.control,
				isCollapsed ? '' : 'hover:bg-white/10'
			]}
			title={sidebarToggleLabel()}
			aria-label={sidebarToggleLabel()}
			aria-pressed={isCollapsed}
			onclick={toggleSidebar}
		>
			<span
				class={[
					'flex size-11 shrink-0 items-center justify-center rounded-md transition',
					isCollapsed ? 'group-hover:bg-white/10' : ''
				]}
			>
				{#if isCollapsed}
					<PanelLeftOpen class="size-5 shrink-0" aria-hidden="true" />
				{:else}
					<PanelLeftClose class="size-5 shrink-0" aria-hidden="true" />
				{/if}
			</span>
			<span class={`${sidebarLabelClass()} truncate text-left`}>{m.collapse_sidebar_short()}</span>
		</button>

		<button
			type="button"
			class={[
				'group flex h-11 w-full items-center rounded-md font-medium text-slate-400 transition hover:text-white',
				textClass.control,
				isCollapsed ? '' : 'hover:bg-white/10'
			]}
			title={m.nav_settings()}
			aria-label={m.nav_settings()}
			onclick={openSettingsDialog}
		>
			<span
				class={[
					'flex size-11 shrink-0 items-center justify-center rounded-md transition',
					isCollapsed ? 'group-hover:bg-white/10' : ''
				]}
			>
				<Settings class="size-5 shrink-0" aria-hidden="true" />
			</span>
			<span class={`${sidebarLabelClass()} truncate text-left`}>{m.nav_settings()}</span>
		</button>

		<AccountMenu
			{isCollapsed}
			{isLoggedIn}
			{authState}
			{accountPubkey}
			{accountProfile}
			onLoginNip07={onLogin}
			{accounts}
			{activeAccountId}
			{onSelectAccount}
			{onRemoveAccount}
			{avatarShape}
			{textClass}
			{getProfile}
			{requestProfiles}
			{profileRelays}
		/>
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
