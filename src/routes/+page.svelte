<script lang="ts">
	import { onDestroy, onMount, tick } from 'svelte';
	import AddColumnDialog from '$lib/components/deck/AddColumnDialog.svelte';
	import ComposePanel from '$lib/components/deck/ComposePanel.svelte';
	import DeckWorkspace from '$lib/components/deck/DeckWorkspace.svelte';
	import KeyboardShortcutsDialog from '$lib/components/deck/KeyboardShortcutsDialog.svelte';
	import Sidebar from '$lib/components/deck/Sidebar.svelte';
	import { createColumnDeckController } from '$lib/deck/column-deck-controller.svelte';
	import { createDeckLayoutController } from '$lib/deck/deck-layout-controller.svelte';
	import { createDisplaySettingsController } from '$lib/deck/display-settings-controller.svelte';
	import { createMutedUsersController } from '$lib/deck/muted-users-controller.svelte';
	import { resetSessionTimelineCache } from '$lib/deck/timeline-cache';
	import { createDetailColumnController } from '$lib/deck/detail-column-controller.svelte';
	import { createComposerController } from '$lib/deck/composer-controller.svelte';
	import { createEmojiReactionController } from '$lib/deck/emoji-reaction-controller.svelte';
	import { createPostActionController } from '$lib/deck/post-action-controller.svelte';
	import { createPostShareController } from '$lib/deck/post-share-controller.svelte';
	import { createKeyboardNavigation } from '$lib/deck/keyboard-navigation';
	import { createUniqueColumnId } from '$lib/deck/column-actions';
	import { createTimelineController } from '$lib/deck/timeline-controller.svelte';
	import { textClassByFontSize } from '$lib/font-size';
	import { getProfile, getProfileDisplayName, requestProfiles } from '$lib/nostr/profiles';
	import {
		clearDefaultRelays,
		configureCachedNip65Relays,
		configureDefaultRelays,
		refreshNip65Relays
	} from '$lib/nostr/nip65';
	import { profileRelays } from '$lib/nostr/relays';
	import {
		getAccountStore,
		getAuthState,
		getAuthSigner,
		initializeAuth,
		loginWithNip07,
		removeAccount as removeAuthAccount,
		selectAccount
	} from '$lib/nostr/auth.svelte';
	import { m } from '$lib/paraglide/messages.js';
	import { getLocale } from '$lib/paraglide/runtime.js';
	import { readUserSettings } from '$lib/user-settings';

	const defaultProfileRelays = [...profileRelays];
	const displaySettingsController = createDisplaySettingsController();
	const mutedUsersController = createMutedUsersController();

	let isColumnDialogOpen = $state(false);
	let isKeyboardShortcutsDialogOpen = $state(false);
	let composeTextarea = $state<HTMLTextAreaElement>();
	let isTimelineCacheReady = $state(false);

	const authState = $derived(getAuthState());
	const accountStore = $derived(getAccountStore());
	const accounts = $derived(accountStore.accounts);
	const activeAccountId = $derived(accountStore.activeAccountId);
	const isLoggedIn = $derived(authState.status === 'loggedIn');
	const accountPubkey = $derived(authState.pubkey);
	const accountProfile = $derived(accountPubkey ? getProfile(accountPubkey) : undefined);
	const accountName = $derived(
		accountPubkey ? getProfileDisplayName(accountProfile, accountPubkey) : ''
	);
	const appLocale = $derived(getLocale());
	const textClass = $derived(textClassByFontSize[displaySettingsController.fontSize]);

	let keyboardNavigation = $state<ReturnType<typeof createKeyboardNavigation> | null>(null);

	function focusColumn(columnId: string, preferPost = false) {
		deckLayoutController.showColumn(columnId);
		void tick().then(() => keyboardNavigation?.focusColumn(columnId, preferPost));
	}

	const columnDeckController = createColumnDeckController({
		beforeActivateDeck: async () => {
			await detailController.close({ restoreFocus: false });
			composer.reset();
		},
		resetFocusMemory: () => keyboardNavigation?.resetFocusMemory(),
		resetSelectedColumn: (columnId) => deckLayoutController.resetSelectedColumn(columnId),
		focusColumn,
		onColumnDeleted: (columnId) => {
			if (detailController.detailColumn?.sourceColumnId === columnId) {
				void detailController.close({ restoreFocus: false });
			}
		}
	});

	const composer = createComposerController({
		getAccountPubkey: () => accountPubkey,
		getSigner: getAuthSigner,
		getIncludeClientTag: () => readUserSettings().includeClientTag,
		focusTextarea: () => composeTextarea?.focus()
	});
	const postActionController = createPostActionController({
		getAccountPubkey: () => accountPubkey,
		getSigner: getAuthSigner,
		getIncludeClientTag: () => readUserSettings().includeClientTag
	});
	const postShareController = createPostShareController();
	const emojiReactionController = createEmojiReactionController({
		getAccountPubkey: () => accountPubkey
	});
	const timelineController = createTimelineController({
		getColumnConfigs: () => columnDeckController.columns,
		isReady: () => isTimelineCacheReady
	});
	const deckLayoutController = createDeckLayoutController({
		getColumns: () => columnDeckController.columns,
		initialColumnId: columnDeckController.activeColumnId
	});
	const isDesktopSingleColumn = $derived(
		deckLayoutController.isSingleColumn && !deckLayoutController.isCompactViewport
	);

	const detailController = createDetailColumnController({
		getColumnConfigs: () => columnDeckController.columns,
		getProfile,
		isMutedUser: mutedUsersController.isMutedUser,
		requestProfiles,
		focusColumn
	});
	keyboardNavigation = createKeyboardNavigation({
		getColumns: () => columnDeckController.columns,
		getActiveColumnId: () => columnDeckController.activeColumnId,
		setActiveColumnId: (columnId) => (columnDeckController.activeColumnId = columnId),
		isLoggedIn: () => isLoggedIn,
		isComposeOpen: () => composer.isOpen,
		closeCompose: composer.close,
		openCompose: composer.open,
		hasDetailColumn: () => detailController.detailColumn !== null,
		closeDetail: () => detailController.close(),
		openKeyboardShortcuts: () => (isKeyboardShortcutsDialogOpen = true)
	});

	onMount(() => {
		const disconnectViewport = deckLayoutController.connectViewport();
		void resetSessionTimelineCache().then(() => {
			isTimelineCacheReady = true;
		});
		void initializeAuth();
		return disconnectViewport;
	});

	$effect(() => {
		if (!accountPubkey) {
			composer.close();
			clearDefaultRelays();
			return;
		}

		requestProfiles([accountPubkey], defaultProfileRelays);
		configureCachedNip65Relays(accountPubkey);
		void refreshNip65Relays(accountPubkey).then((relayTags) => {
			if (relayTags && getAuthState().pubkey === accountPubkey) {
				configureDefaultRelays(relayTags);
			}
		});
	});

	onDestroy(() => {
		timelineController.stop();
		detailController.stop();
	});

	function openAddColumnDialog() {
		isColumnDialogOpen = true;
	}

	async function toggleComposePanel() {
		if (!isLoggedIn) return;

		if (composer.isOpen) {
			composer.close();
			return;
		}

		await composer.open();
	}

	async function login() {
		return loginWithNip07();
	}

	async function selectSavedAccount(accountId: string) {
		composer.close();
		return selectAccount(accountId);
	}

	async function removeSavedAccount(accountId: string) {
		composer.close();
		return removeAuthAccount(accountId);
	}
</script>

<svelte:window
	onkeydown={(event) => void keyboardNavigation?.handleKeyboardNavigation(event)}
	onfocusin={(event) => keyboardNavigation?.handleFocusIn(event)}
/>

<svelte:head>
	<title>{m.app_title()}</title>
</svelte:head>

<main
	class={[
		'app-shell flex min-h-0 overflow-hidden bg-[#eef3f7] text-slate-950 dark:bg-slate-950 dark:text-slate-50',
		isDesktopSingleColumn ? 'justify-center' : ''
	]}
>
	<Sidebar
		columns={columnDeckController.columns}
		decks={columnDeckController.store.decks}
		activeDeckId={columnDeckController.store.activeDeckId}
		activeColumnId={columnDeckController.activeColumnId}
		{isLoggedIn}
		{authState}
		{accountPubkey}
		{accountProfile}
		{accounts}
		{activeAccountId}
		onLogin={login}
		onSelectAccount={selectSavedAccount}
		onRemoveAccount={removeSavedAccount}
		onAddColumn={openAddColumnDialog}
		onSelectDeck={columnDeckController.selectDeck}
		onCreateDeck={columnDeckController.createDeck}
		onRenameDeck={columnDeckController.renameDeck}
		onDuplicateDeck={columnDeckController.duplicateDeck}
		onDeleteDeck={columnDeckController.deleteDeck}
		onCompose={toggleComposePanel}
		fontSize={displaySettingsController.fontSize}
		avatarShape={displaySettingsController.avatarShape}
		postActionVisibility={displaySettingsController.postActionVisibility}
		{textClass}
		onFontSizeChange={displaySettingsController.updateFontSize}
		onAvatarShapeChange={displaySettingsController.updateAvatarShape}
		onPostActionVisibilityChange={displaySettingsController.updatePostActionVisibility}
		onSelectColumn={focusColumn}
		onReorderColumn={columnDeckController.reorderColumn}
		mutedPubkeys={mutedUsersController.pubkeys}
		{getProfile}
		{requestProfiles}
		profileRelays={defaultProfileRelays}
		onUnmuteUser={mutedUsersController.unmuteUser}
		isSingleColumnLayout={deckLayoutController.isSingleColumn}
		isCompactViewport={deckLayoutController.isCompactViewport}
		onToggleLayoutMode={deckLayoutController.toggleLayoutMode}
	/>

	{#if isLoggedIn && composer.isOpen}
		<ComposePanel
			{composer}
			{accountName}
			{accountProfile}
			avatarShape={displaySettingsController.avatarShape}
			{textClass}
			bind:textarea={composeTextarea}
		/>
	{/if}

	<DeckWorkspace
		{columnDeckController}
		{deckLayoutController}
		{timelineController}
		{detailController}
		{composer}
		{postActionController}
		{postShareController}
		{emojiReactionController}
		{isDesktopSingleColumn}
		{isLoggedIn}
		{textClass}
		avatarShape={displaySettingsController.avatarShape}
		postActionVisibility={displaySettingsController.postActionVisibility}
		{appLocale}
		{getProfile}
		{requestProfiles}
		profileRelays={defaultProfileRelays}
		isMutedUser={mutedUsersController.isMutedUser}
		onMuteUser={mutedUsersController.muteUser}
		onAddColumn={openAddColumnDialog}
	/>
</main>

<AddColumnDialog
	bind:isOpen={isColumnDialogOpen}
	{textClass}
	createColumnId={() => createUniqueColumnId(columnDeckController.columns)}
	onSave={(column) => void columnDeckController.saveColumn(column)}
/>

<KeyboardShortcutsDialog bind:isOpen={isKeyboardShortcutsDialogOpen} {textClass} />
