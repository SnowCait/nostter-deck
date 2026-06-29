<script lang="ts">
	import { Check, ChevronDown, Plus, Trash2, UserRound } from '@lucide/svelte';
	import { npubEncode } from 'nostr-tools/nip19';
	import { m } from '$lib/paraglide/messages.js';
	import type { FontSizeTextClasses } from '$lib/font-size';
	import type { AuthState } from '$lib/nostr/auth.svelte';
	import type { AccountRecord } from '$lib/nostr/accounts';
	import * as Dialog from '$lib/components/ui/dialog';
	import * as Popover from '$lib/components/ui/popover';
	import { getProfileDisplayName, type Profile } from '$lib/nostr/profiles';
	import type { AvatarShape } from '$lib/user-settings';
	import AccountLoginDialog from './AccountLoginDialog.svelte';
	import ProfileAvatar from './ProfileAvatar.svelte';

	type Props = {
		isCollapsed: boolean;
		isLoggedIn: boolean;
		authState: AuthState;
		accountPubkey: string | null;
		accountProfile: Profile | undefined;
		onLoginNip07: () => Promise<boolean>;
		accounts: AccountRecord[];
		activeAccountId: string | null;
		onSelectAccount: (accountId: string) => Promise<boolean>;
		onRemoveAccount: (accountId: string) => Promise<boolean>;
		avatarShape: AvatarShape;
		textClass: FontSizeTextClasses;
		getProfile: (pubkey: string) => Profile | undefined;
		requestProfiles: (pubkeys: string[], relays: string[]) => void;
		profileRelays: string[];
	};

	let {
		isCollapsed,
		isLoggedIn,
		authState,
		accountPubkey,
		accountProfile,
		onLoginNip07,
		accounts,
		activeAccountId,
		onSelectAccount,
		onRemoveAccount,
		avatarShape,
		textClass,
		getProfile,
		requestProfiles,
		profileRelays
	}: Props = $props();
	let isAccountMenuOpen = $state(false);
	let isLoginDialogOpen = $state(false);
	let pendingAccountId = $state<string | null>(null);
	let accountToRemove = $state<AccountRecord | null>(null);
	let isRemoveAccountDialogOpen = $state(false);
	let accountMenuTrigger = $state<HTMLButtonElement | null>(null);

	const sidebarLabelClass = () =>
		[
			'min-w-0 overflow-hidden whitespace-nowrap transition-all duration-150 ease-out',
			isCollapsed ? 'max-w-0 opacity-0' : 'max-w-[150px] opacity-100'
		].join(' ');

	function openLoginDialog() {
		isLoginDialogOpen = true;
		isAccountMenuOpen = false;
	}

	function setAccountMenuOpen(open: boolean) {
		isAccountMenuOpen = open;
	}

	function getAccountName() {
		return accountPubkey ? getProfileDisplayName(accountProfile, accountPubkey) : m.account_npub();
	}

	function getShortNpub() {
		if (!accountPubkey) return '';
		return `${npubEncode(accountPubkey).slice(0, 16)}…`;
	}

	function getAccountDisplayName(account: AccountRecord) {
		const profile = getProfile(account.pubkey);
		return getProfileDisplayName(profile, account.pubkey);
	}

	function getAccountShortNpub(account: AccountRecord) {
		return `${npubEncode(account.pubkey).slice(0, 16)}…`;
	}

	function getAccountMethodLabel(account: AccountRecord) {
		return account.method === 'nip07' ? m.account_method_nip07() : m.account_method_nip46();
	}

	async function selectSavedAccount(accountId: string) {
		if (accountId === activeAccountId || pendingAccountId) return;
		pendingAccountId = accountId;
		const success = await onSelectAccount(accountId);
		pendingAccountId = null;
		if (success) isAccountMenuOpen = false;
	}

	function requestAccountRemoval(account: AccountRecord) {
		isAccountMenuOpen = false;
		accountToRemove = account;
		isRemoveAccountDialogOpen = true;
	}

	async function removeSavedAccount() {
		if (!accountToRemove || pendingAccountId) return;
		pendingAccountId = accountToRemove.id;
		await onRemoveAccount(accountToRemove.id);
		pendingAccountId = null;
		accountToRemove = null;
		isRemoveAccountDialogOpen = false;
	}

	$effect(() => {
		if (!isAccountMenuOpen || accounts.length === 0) return;
		requestProfiles(
			accounts.map((account) => account.pubkey),
			profileRelays
		);
	});

	$effect(() => {
		if (!isRemoveAccountDialogOpen) accountToRemove = null;
	});
</script>

<Popover.Root open={isAccountMenuOpen} onOpenChange={setAccountMenuOpen}>
	{#if isLoggedIn}
		<Popover.Trigger
			bind:ref={accountMenuTrigger}
			type="button"
			class={[
				'flex min-h-11 w-full items-center rounded-md bg-white/5 py-1 text-left transition hover:bg-white/10',
				isCollapsed ? '' : 'ring-1 ring-slate-800'
			]}
			aria-label={m.account_menu()}
			title={m.account_menu()}
		>
			<div class="flex w-11 shrink-0 justify-center">
				<ProfileAvatar
					shape={avatarShape}
					sizeClass="size-9"
					imageUrl={accountProfile?.picture}
					fallbackClass="bg-slate-100 text-slate-950"
					testId="account-avatar"
				>
					<UserRound class="size-4" aria-hidden="true" />
				</ProfileAvatar>
			</div>
			<div class={sidebarLabelClass()}>
				<p class={['truncate font-semibold', textClass.account]}>{getAccountName()}</p>
				<p class={['truncate text-slate-400', textClass.meta]}>{getShortNpub()}</p>
			</div>
			{#if !isCollapsed}
				<ChevronDown class="mr-3 size-4 shrink-0 text-slate-400" aria-hidden="true" />
			{/if}
		</Popover.Trigger>
	{:else}
		<Popover.Trigger
			bind:ref={accountMenuTrigger}
			type="button"
			class={[
				'group flex h-11 w-full items-center rounded-md font-medium text-slate-400 transition hover:text-white',
				textClass.control,
				isCollapsed ? '' : 'hover:bg-white/10'
			]}
			title={m.login()}
			aria-label={m.login()}
		>
			<span
				class={[
					'flex size-11 shrink-0 items-center justify-center rounded-md transition',
					isCollapsed ? 'group-hover:bg-white/10' : ''
				]}
			>
				<UserRound class="size-5 shrink-0" aria-hidden="true" />
			</span>
			<span class={`${sidebarLabelClass()} truncate text-left`}>{m.login()}</span>
		</Popover.Trigger>
	{/if}
	<Popover.Content
		align="start"
		side="top"
		sideOffset={8}
		customAnchor={accountMenuTrigger}
		portalProps={{ to: 'body' }}
		class="z-[70] w-80 gap-3 border border-slate-200 bg-white p-3 text-slate-950 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-50"
		data-testid="account-menu"
	>
		<div>
			<p class={['font-bold', textClass.heading]}>{m.account_menu()}</p>
			{#if authState.status === 'error'}
				<p class={['mt-1 text-rose-600 dark:text-rose-400', textClass.meta]} role="alert">
					{m.account_connection_failed()}
				</p>
			{/if}
		</div>
		<div class="grid gap-1">
			{#each accounts as account (account.id)}
				<div
					class={[
						'flex min-h-14 items-center gap-2 rounded-md border p-2',
						account.id === activeAccountId
							? 'border-sky-400 bg-sky-50 dark:border-sky-700 dark:bg-sky-950/40'
							: 'border-transparent hover:bg-slate-100 dark:hover:bg-slate-900'
					]}
				>
					<button
						type="button"
						class="flex min-w-0 flex-1 items-center gap-2 text-left disabled:cursor-wait"
						disabled={pendingAccountId !== null}
						onclick={() => void selectSavedAccount(account.id)}
					>
						<ProfileAvatar
							shape={avatarShape}
							sizeClass="size-8"
							imageUrl={getProfile(account.pubkey)?.picture}
							fallbackClass="bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-200"
						>
							<UserRound class="size-4" aria-hidden="true" />
						</ProfileAvatar>
						<span class="min-w-0 flex-1">
							<span class={['block truncate font-semibold', textClass.control]}>
								{getAccountDisplayName(account)}
							</span>
							<span class={['block truncate text-slate-500 dark:text-slate-400', textClass.meta]}>
								{getAccountMethodLabel(account)} · {getAccountShortNpub(account)}
							</span>
						</span>
						{#if account.id === activeAccountId}
							<Check
								class="size-4 shrink-0 text-sky-600 dark:text-sky-400"
								aria-label={m.active_account()}
							/>
						{/if}
					</button>
					<button
						type="button"
						class="rounded p-1.5 text-slate-400 transition hover:bg-rose-100 hover:text-rose-700 dark:hover:bg-rose-950 dark:hover:text-rose-300"
						aria-label={m.remove_account({ name: getAccountDisplayName(account) })}
						title={m.remove_account({ name: getAccountDisplayName(account) })}
						disabled={pendingAccountId !== null}
						onclick={() => requestAccountRemoval(account)}
					>
						<Trash2 class="size-4" aria-hidden="true" />
					</button>
				</div>
			{:else}
				<p class={['px-1 text-slate-500 dark:text-slate-400', textClass.meta]}>
					{m.accounts_empty()}
				</p>
			{/each}
		</div>
		<button
			type="button"
			class={[
				'flex w-full items-center justify-center gap-2 rounded-md bg-sky-500 px-3 py-2 font-semibold text-white transition hover:bg-sky-600',
				textClass.control
			]}
			onclick={openLoginDialog}
		>
			<Plus class="size-4" aria-hidden="true" />
			{m.add_account()}
		</button>
	</Popover.Content>
</Popover.Root>

<AccountLoginDialog bind:isOpen={isLoginDialogOpen} {onLoginNip07} />

<Dialog.Root bind:open={isRemoveAccountDialogOpen}>
	<Dialog.Content
		closeLabel={m.close()}
		class="max-w-sm bg-white text-slate-950 dark:bg-slate-950 dark:text-slate-50"
	>
		<Dialog.Title class="font-bold">{m.remove_account_title()}</Dialog.Title>
		<Dialog.Description class="mt-2 text-slate-600 dark:text-slate-300">
			{m.remove_account_description({
				name: accountToRemove ? getAccountDisplayName(accountToRemove) : ''
			})}
		</Dialog.Description>
		<div class="mt-5 flex justify-end gap-2">
			<button
				type="button"
				class="rounded-md border border-slate-300 px-3 py-2 font-semibold dark:border-slate-700"
				disabled={pendingAccountId !== null}
				onclick={() => (isRemoveAccountDialogOpen = false)}
			>
				{m.cancel()}
			</button>
			<button
				type="button"
				class="rounded-md bg-rose-600 px-3 py-2 font-semibold text-white disabled:cursor-wait disabled:opacity-60"
				disabled={pendingAccountId !== null}
				onclick={() => void removeSavedAccount()}
			>
				{m.remove_account_confirm()}
			</button>
		</div>
	</Dialog.Content>
</Dialog.Root>
