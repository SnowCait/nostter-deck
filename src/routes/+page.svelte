<script lang="ts">
	import { onDestroy, onMount, tick } from 'svelte';
	import { CalendarClock, Image, Plus, Send, Smile, UserRound, X } from '@lucide/svelte';
	import { npubEncode } from 'nostr-tools/nip19';
	import AddColumnDialog from '$lib/components/deck/AddColumnDialog.svelte';
	import DeckColumn from '$lib/components/deck/DeckColumn.svelte';
	import KeyboardShortcutsDialog from '$lib/components/deck/KeyboardShortcutsDialog.svelte';
	import ProfileColumn from '$lib/components/deck/ProfileColumn.svelte';
	import ThreadColumn from '$lib/components/deck/ThreadColumn.svelte';
	import ProfileAvatar from '$lib/components/deck/ProfileAvatar.svelte';
	import Sidebar from '$lib/components/deck/Sidebar.svelte';
	import {
		createColumnDeck,
		duplicateColumnDeck,
		hasColumnDeckName,
		readColumnDeckStore,
		writeColumnDeckStore,
		type ColumnDeckStore
	} from '$lib/deck/column-decks';
	import { emptyTimelineRuntime } from '$lib/deck/timeline-runtime';
	import { resetSessionTimelineCache } from '$lib/deck/timeline-cache';
	import { createDetailColumnController } from '$lib/deck/detail-column-controller.svelte';
	import { createTimelineController } from '$lib/deck/timeline-controller.svelte';
	import type {
		ChannelTimelineColumnConfig,
		ColumnConfig,
		ColumnIconKey,
		ColumnWidth
	} from '$lib/deck/types';
	import {
		saveChannelSettings as saveChannelSettingsConfig,
		saveCustomTimelineSettings as saveCustomTimelineSettingsConfig,
		saveFollowSettings as saveFollowSettingsConfig,
		saveSearchSettings as saveSearchSettingsConfig,
		updateColumnIcon as updateColumnIconConfig,
		updateColumnTitle as updateColumnTitleConfig,
		updateColumnWidth as updateColumnWidthConfig
	} from '$lib/deck/column-updates';
	import { textClassByFontSize } from '$lib/font-size';
	import {
		addMutedPubkey,
		readMutedPubkeys,
		removeMutedPubkey,
		writeMutedPubkeys
	} from '$lib/muted-users';
	import type { ChannelPointer, ProfilePointer } from '$lib/nostr/nip19';
	import { getProfile, requestProfiles } from '$lib/nostr/profiles';
	import {
		clearDefaultRelays,
		configureCachedNip65Relays,
		configureDefaultRelays,
		refreshNip65Relays
	} from '$lib/nostr/nip65';
	import { publishChannelMessage, publishShortTextNote } from '$lib/nostr/publish';
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
	import { readUserSettings, type AvatarShape, type FontSize } from '$lib/user-settings';

	const savedColumnDeckStore = readColumnDeckStore();
	const savedActiveDeck =
		savedColumnDeckStore.decks.find((deck) => deck.id === savedColumnDeckStore.activeDeckId) ??
		savedColumnDeckStore.decks[0];
	const defaultProfileRelays = [...profileRelays];
	const emptyColumnRuntime = emptyTimelineRuntime();

	let columnDeckStore = $state<ColumnDeckStore>(savedColumnDeckStore);
	let columnConfigs = $state<ColumnConfig[]>(
		(savedActiveDeck?.columns ?? []).map((column) => ({ ...column }))
	);
	let activeColumnId = $state(savedActiveDeck?.columns[0]?.id ?? '');
	let isColumnDialogOpen = $state(false);
	let isKeyboardShortcutsDialogOpen = $state(false);
	let openSettingsColumnId = $state<string | null>(null);
	let isComposePanelOpen = $state(false);
	let composeText = $state('');
	let isPublishing = $state(false);
	let publishError = $state(false);
	let composeTextarea = $state<HTMLTextAreaElement>();
	const initialUserSettings = readUserSettings();
	let fontSize = $state<FontSize>(initialUserSettings.fontSize);
	let avatarShape = $state<AvatarShape>(initialUserSettings.avatarShape);
	let isTimelineCacheReady = $state(false);
	let mutedPubkeys = $state(readMutedPubkeys());
	const lastFocusedPostKeyByColumnId: Record<string, string> = {};

	const authState = $derived(getAuthState());
	const accountStore = $derived(getAccountStore());
	const accounts = $derived(accountStore.accounts);
	const activeAccountId = $derived(accountStore.activeAccountId);
	const isLoggedIn = $derived(authState.status === 'loggedIn');
	const accountPubkey = $derived(authState.pubkey);
	const accountProfile = $derived(accountPubkey ? getProfile(accountPubkey) : undefined);
	const accountName = $derived(
		accountProfile?.display_name ??
			accountProfile?.name ??
			(accountPubkey ? `${npubEncode(accountPubkey).slice(0, 16)}…` : '')
	);
	const canSubmitPost = $derived(!isPublishing && composeText.length > 0);
	const textClass = $derived(textClassByFontSize[fontSize]);
	const timelineController = createTimelineController({
		getColumnConfigs: () => columnConfigs,
		isReady: () => isTimelineCacheReady
	});
	const detailController = createDetailColumnController({
		getColumnConfigs: () => columnConfigs,
		getProfile,
		isMutedUser,
		requestProfiles,
		focusColumn
	});

	onMount(() => {
		void resetSessionTimelineCache().then(() => {
			isTimelineCacheReady = true;
		});
		void initializeAuth();
	});

	$effect(() => {
		if (!accountPubkey) {
			isComposePanelOpen = false;
			publishError = false;
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

	function getColumnId(columnId: string) {
		return `deck-column-${columnId}`;
	}

	function getColumnElement(columnId: string) {
		return document.getElementById(getColumnId(columnId));
	}

	function getPostElements(columnElement: HTMLElement) {
		return [...columnElement.querySelectorAll<HTMLElement>('[data-deck-post]')];
	}

	function focusPost(columnId: string, postElement: HTMLElement) {
		const postKey = postElement.dataset.postKey;
		if (postKey) lastFocusedPostKeyByColumnId[columnId] = postKey;
		activeColumnId = columnId;
		postElement.scrollIntoView({ block: 'nearest', inline: 'nearest' });
		postElement.focus({ preventScroll: true });
	}

	function getRememberedPost(columnId: string, columnElement: HTMLElement) {
		const postElements = getPostElements(columnElement);
		const rememberedPostKey = lastFocusedPostKeyByColumnId[columnId];
		return (
			postElements.find((postElement) => postElement.dataset.postKey === rememberedPostKey) ??
			postElements[0]
		);
	}

	function focusColumn(columnId: string, preferPost = false) {
		activeColumnId = columnId;

		const columnElement = getColumnElement(columnId);
		columnElement?.scrollIntoView({
			behavior: 'smooth',
			block: 'nearest',
			inline: 'nearest'
		});
		if (preferPost && columnElement) {
			const postElement = getRememberedPost(columnId, columnElement);
			if (postElement) {
				focusPost(columnId, postElement);
				return;
			}
		}
		columnElement?.focus({ preventScroll: true });
	}

	function getDisplayedColumnElements() {
		return [...document.querySelectorAll<HTMLElement>('[data-deck-column]')];
	}

	function getFocusedColumnElement() {
		const activeElement = document.activeElement;
		const focusedColumn =
			activeElement instanceof Element
				? activeElement.closest<HTMLElement>('[data-deck-column]')
				: null;
		return focusedColumn ?? getColumnElement(activeColumnId) ?? getDisplayedColumnElements()[0];
	}

	function isKeyboardOverlayOpen() {
		return Boolean(
			document.querySelector(
				'[data-slot="dialog-content"][data-state="open"], [data-slot="popover-content"][data-state="open"]'
			)
		);
	}

	function isEditableKeyboardTarget(target: EventTarget | null) {
		if (!(target instanceof Element)) return false;
		return Boolean(
			target.closest(
				'input, textarea, select, iframe, [contenteditable="true"], [role="option"], [role="menuitem"]'
			)
		);
	}

	function isComposePanelKeyboardTarget(target: EventTarget | null) {
		return target instanceof Element && Boolean(target.closest('[data-compose-panel]'));
	}

	function isKeyboardNavigationBlocked(target: EventTarget | null, key: string) {
		if (!(target instanceof Element)) return false;
		if (isEditableKeyboardTarget(target)) return true;

		if (target.closest('button, a, [role="button"], [role="link"]')) {
			return !['h', 'j', 'k', 'l'].includes(key);
		}

		return false;
	}

	function moveColumnFocus(direction: -1 | 1) {
		const columnElements = getDisplayedColumnElements();
		const currentColumn = getFocusedColumnElement();
		const currentIndex = currentColumn ? columnElements.indexOf(currentColumn) : -1;
		if (currentIndex < 0) return;

		const nextColumn = columnElements[currentIndex + direction];
		const nextColumnId = nextColumn?.dataset.columnId;
		if (nextColumnId) focusColumn(nextColumnId, true);
	}

	function movePostFocus(direction: -1 | 1) {
		const columnElement = getFocusedColumnElement();
		const columnId = columnElement?.dataset.columnId;
		if (!columnElement || !columnId) return;

		const postElements = getPostElements(columnElement);
		if (postElements.length === 0) return;

		const activeElement = document.activeElement;
		const currentPost =
			activeElement instanceof Element
				? activeElement.closest<HTMLElement>('[data-deck-post]')
				: null;
		const currentIndex = currentPost ? postElements.indexOf(currentPost) : -1;
		const nextIndex =
			currentIndex < 0
				? 0
				: Math.max(0, Math.min(currentIndex + direction, postElements.length - 1));
		focusPost(columnId, postElements[nextIndex]);
	}

	function activateFocusedPostAction(selector: string) {
		const activeElement = document.activeElement;
		const postElement =
			activeElement instanceof Element
				? activeElement.closest<HTMLElement>('[data-deck-post]')
				: null;
		if (!postElement || activeElement !== postElement) return;

		postElement.querySelector<HTMLElement>(selector)?.click();
	}

	function scrollActiveTimelineToTop() {
		const activeColumn = columnConfigs.find((column) => column.id === activeColumnId);
		if (activeColumn?.type !== 'timeline') return;

		getColumnElement(activeColumnId)
			?.querySelector<HTMLDivElement>('[data-testid="timeline-scroll"]')
			?.scrollTo({ top: 0, behavior: 'smooth' });
	}

	function handleKeyboardNavigation(event: KeyboardEvent) {
		if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
		if (isKeyboardOverlayOpen()) return;

		if (event.key === 'Escape') {
			if (
				isComposePanelOpen &&
				(isComposePanelKeyboardTarget(event.target) || !detailController.detailColumn)
			) {
				event.preventDefault();
				closeComposePanel();
				return;
			}

			if (detailController.detailColumn) {
				event.preventDefault();
				void detailController.close();
				return;
			}
		}

		const key = event.key.toLowerCase();
		if (key === 'n') {
			if (isEditableKeyboardTarget(event.target) || !isLoggedIn) return;
			event.preventDefault();
			void openComposePanel();
			return;
		}

		const isKeyboardShortcutsKey = event.key === '?' || (event.code === 'Slash' && event.shiftKey);
		if (isKeyboardShortcutsKey) {
			if (isEditableKeyboardTarget(event.target)) return;
			event.preventDefault();
			isKeyboardShortcutsDialogOpen = true;
			return;
		}

		if (event.key === 'Home') {
			if (isEditableKeyboardTarget(event.target)) return;
			event.preventDefault();
			scrollActiveTimelineToTop();
			return;
		}

		if (isKeyboardNavigationBlocked(event.target, key)) return;

		if (key === 'h' || event.key === 'ArrowLeft') {
			event.preventDefault();
			moveColumnFocus(-1);
		} else if (key === 'l' || event.key === 'ArrowRight') {
			event.preventDefault();
			moveColumnFocus(1);
		} else if (key === 'j' || event.key === 'ArrowDown') {
			event.preventDefault();
			movePostFocus(1);
		} else if (key === 'k' || event.key === 'ArrowUp') {
			event.preventDefault();
			movePostFocus(-1);
		} else if (event.key === 'Enter') {
			event.preventDefault();
			activateFocusedPostAction('[data-keyboard-open-thread]');
		} else if (key === 'p') {
			event.preventDefault();
			activateFocusedPostAction('[data-keyboard-open-profile]');
		}
	}

	function handleFocusIn(event: FocusEvent) {
		const target = event.target;
		if (!(target instanceof Element)) return;

		const columnElement = target.closest<HTMLElement>('[data-deck-column]');
		const columnId = columnElement?.dataset.columnId;
		if (!columnId) return;
		activeColumnId = columnId;

		const postElement = target.closest<HTMLElement>('[data-deck-post]');
		const postKey = postElement?.dataset.postKey;
		if (postKey) lastFocusedPostKeyByColumnId[columnId] = postKey;
	}

	function createColumnId(columns: ColumnConfig[]) {
		const columnIds = new Set(columns.map((column) => column.id));

		while (true) {
			const id = crypto.randomUUID();
			if (!columnIds.has(id)) return id;
		}
	}

	function writeDeckStore(nextStore: ColumnDeckStore) {
		columnDeckStore = nextStore;
		writeColumnDeckStore(nextStore);
	}

	function getDeck(deckId: string) {
		return columnDeckStore.decks.find((deck) => deck.id === deckId) ?? null;
	}

	function setColumnConfigs(nextColumnConfigs: ColumnConfig[]) {
		const activeDeckId = columnDeckStore.activeDeckId;
		const nextStore = {
			...columnDeckStore,
			decks: columnDeckStore.decks.map((deck) =>
				deck.id === activeDeckId ? { ...deck, columns: nextColumnConfigs } : deck
			)
		};
		columnConfigs = nextColumnConfigs;
		writeDeckStore(nextStore);
	}

	function createDeckId() {
		const deckIds = new Set(columnDeckStore.decks.map((deck) => deck.id));
		while (true) {
			const id = crypto.randomUUID();
			if (!deckIds.has(id)) return id;
		}
	}

	function createDeckColumnIdGenerator() {
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- short-lived duplicate ID registry
		const columnIds = new Set(
			columnDeckStore.decks.flatMap((deck) => deck.columns.map((column) => column.id))
		);
		return () => {
			while (true) {
				const id = crypto.randomUUID();
				if (columnIds.has(id)) continue;
				columnIds.add(id);
				return id;
			}
		};
	}

	async function activateDeck(nextStore: ColumnDeckStore, deckId: string) {
		const nextDeck = nextStore.decks.find((deck) => deck.id === deckId);
		if (!nextDeck) return;

		await detailController.close({ restoreFocus: false });
		isComposePanelOpen = false;
		composeText = '';
		publishError = false;
		openSettingsColumnId = null;
		for (const columnId of Object.keys(lastFocusedPostKeyByColumnId)) {
			delete lastFocusedPostKeyByColumnId[columnId];
		}

		columnConfigs = nextDeck.columns.map((column) => ({ ...column }));
		activeColumnId = nextDeck.columns[0]?.id ?? '';
		writeDeckStore({ ...nextStore, activeDeckId: deckId });
		await tick();
		if (activeColumnId) focusColumn(activeColumnId);
	}

	async function selectDeck(deckId: string) {
		if (deckId === columnDeckStore.activeDeckId) return;
		await activateDeck(columnDeckStore, deckId);
	}

	async function createDeck(name: string) {
		if (hasColumnDeckName(columnDeckStore.decks, name)) return;
		const deck = createColumnDeck(createDeckId(), name);
		if (!deck) return;
		await activateDeck({ ...columnDeckStore, decks: [...columnDeckStore.decks, deck] }, deck.id);
	}

	function renameDeck(deckId: string, name: string) {
		if (hasColumnDeckName(columnDeckStore.decks, name, deckId)) return;
		writeDeckStore({
			...columnDeckStore,
			decks: columnDeckStore.decks.map((deck) =>
				deck.id === deckId ? { ...deck, name: name.trim() } : deck
			)
		});
	}

	async function duplicateDeck(deckId: string, name: string) {
		if (hasColumnDeckName(columnDeckStore.decks, name)) return;
		const sourceDeck = getDeck(deckId);
		if (!sourceDeck) return;
		const deck = duplicateColumnDeck(
			sourceDeck,
			createDeckId(),
			name,
			createDeckColumnIdGenerator()
		);
		if (!deck) return;
		await activateDeck({ ...columnDeckStore, decks: [...columnDeckStore.decks, deck] }, deck.id);
	}

	async function deleteDeck(deckId: string) {
		if (columnDeckStore.decks.length <= 1) return;
		const deckIndex = columnDeckStore.decks.findIndex((deck) => deck.id === deckId);
		if (deckIndex < 0) return;
		const nextDecks = columnDeckStore.decks.filter((deck) => deck.id !== deckId);
		const nextStore = { ...columnDeckStore, decks: nextDecks };
		if (deckId !== columnDeckStore.activeDeckId) {
			writeDeckStore(nextStore);
			return;
		}

		const nextDeck = nextDecks[Math.min(deckIndex, nextDecks.length - 1)];
		await activateDeck(nextStore, nextDeck.id);
	}

	function isMutedUser(pubkey: string) {
		return mutedPubkeys.includes(pubkey);
	}

	function muteUser(pubkey: string) {
		mutedPubkeys = addMutedPubkey(mutedPubkeys, pubkey);
		writeMutedPubkeys(mutedPubkeys);
	}

	function unmuteUser(pubkey: string) {
		mutedPubkeys = removeMutedPubkey(mutedPubkeys, pubkey);
		writeMutedPubkeys(mutedPubkeys);
	}

	function openAddColumnDialog() {
		isColumnDialogOpen = true;
	}

	async function toggleComposePanel() {
		if (!isLoggedIn) return;

		if (isComposePanelOpen) {
			isComposePanelOpen = false;
			return;
		}

		await openComposePanel();
	}

	async function openComposePanel() {
		if (!isLoggedIn) return;

		isComposePanelOpen = true;
		await tick();
		composeTextarea?.focus();
	}

	function closeComposePanel() {
		isComposePanelOpen = false;
	}

	function handleComposeKeydown(event: KeyboardEvent) {
		if (event.key !== 'Enter' || (!event.ctrlKey && !event.metaKey)) return;

		event.preventDefault();
		void publishPost();
	}

	async function publishPost() {
		if (!canSubmitPost || !accountPubkey) return;

		const signer = getAuthSigner();
		if (!signer) {
			publishError = true;
			return;
		}

		isPublishing = true;
		publishError = false;
		const result = await publishShortTextNote(composeText, accountPubkey, signer, {
			includeClientTag: readUserSettings().includeClientTag
		});
		isPublishing = false;

		if (!result.ok) {
			publishError = true;
			return;
		}

		composeText = '';
		isComposePanelOpen = false;
	}

	async function publishChannelPost(channel: ChannelTimelineColumnConfig, content: string) {
		if (!accountPubkey) return { ok: false as const, reason: 'signing-failed' as const };

		const signer = getAuthSigner();
		if (!signer) return { ok: false as const, reason: 'signing-failed' as const };

		return publishChannelMessage(
			content,
			channel.channelId,
			accountPubkey,
			signer,
			channel.relays,
			{
				includeClientTag: readUserSettings().includeClientTag
			}
		);
	}

	async function login() {
		return loginWithNip07();
	}

	async function selectSavedAccount(accountId: string) {
		isComposePanelOpen = false;
		publishError = false;
		return selectAccount(accountId);
	}

	async function removeSavedAccount(accountId: string) {
		isComposePanelOpen = false;
		publishError = false;
		return removeAuthAccount(accountId);
	}

	async function saveColumn(column: ColumnConfig) {
		setColumnConfigs([...columnConfigs, column]);
		await tick();
		focusColumn(column.id);
	}

	async function openHashtagColumn(sourceColumnId: string, hashtag: string) {
		const query = hashtag.trim();
		if (!query) return;

		const existingColumn = columnConfigs.find(
			(column) =>
				column.type === 'timeline' &&
				column.timelineKind === 'preset' &&
				column.sourceKey === 'timeline_search' &&
				column.query === query
		);
		if (existingColumn) {
			focusColumn(existingColumn.id);
			return;
		}

		const sourceIndex = columnConfigs.findIndex((column) => column.id === sourceColumnId);
		const nextColumn: ColumnConfig = {
			id: createColumnId(columnConfigs),
			type: 'timeline',
			timelineKind: 'preset',
			sourceKey: 'timeline_search',
			query,
			width: 'standard'
		};
		const nextColumns = [...columnConfigs];
		nextColumns.splice(sourceIndex >= 0 ? sourceIndex + 1 : nextColumns.length, 0, nextColumn);
		setColumnConfigs(nextColumns);
		await tick();
		focusColumn(nextColumn.id);
	}

	async function deleteColumn(columnId: string) {
		const deletedIndex = columnConfigs.findIndex((column) => column.id === columnId);
		if (deletedIndex < 0) return;

		const nextColumns = columnConfigs.filter((column) => column.id !== columnId);
		setColumnConfigs(nextColumns);
		if (detailController.detailColumn?.sourceColumnId === columnId) {
			void detailController.close({ restoreFocus: false });
		}
		openSettingsColumnId = null;

		if (activeColumnId !== columnId) return;

		const nextActiveColumn = nextColumns[Math.min(deletedIndex, nextColumns.length - 1)];
		activeColumnId = nextActiveColumn?.id ?? '';

		if (nextActiveColumn) {
			await tick();
			focusColumn(nextActiveColumn.id);
		}
	}

	async function moveColumn(columnId: string, direction: -1 | 1) {
		const currentIndex = columnConfigs.findIndex((column) => column.id === columnId);
		const nextIndex = currentIndex + direction;

		if (currentIndex < 0 || nextIndex < 0 || nextIndex >= columnConfigs.length) return;

		const nextColumns = [...columnConfigs];
		const [column] = nextColumns.splice(currentIndex, 1);
		nextColumns.splice(nextIndex, 0, column);
		setColumnConfigs(nextColumns);

		await tick();
		focusColumn(columnId);
	}

	function reorderColumn(columnId: string, targetIndex: number) {
		const currentIndex = columnConfigs.findIndex((column) => column.id === columnId);
		if (currentIndex < 0) return;

		const nextColumns = [...columnConfigs];
		const [column] = nextColumns.splice(currentIndex, 1);
		const adjustedTargetIndex = currentIndex < targetIndex ? targetIndex - 1 : targetIndex;
		const nextIndex = Math.max(0, Math.min(adjustedTargetIndex, nextColumns.length));
		if (nextIndex === currentIndex) return;

		nextColumns.splice(nextIndex, 0, column);
		setColumnConfigs(nextColumns);
	}

	function updateColumnWidth(columnId: string, width: ColumnWidth) {
		setColumnConfigs(updateColumnWidthConfig(columnConfigs, columnId, width));
	}

	function updateColumnTitle(columnId: string, title: string) {
		setColumnConfigs(updateColumnTitleConfig(columnConfigs, columnId, title));
	}

	function updateColumnIcon(columnId: string, icon: ColumnIconKey | null) {
		setColumnConfigs(updateColumnIconConfig(columnConfigs, columnId, icon));
	}

	function saveCustomTimelineSettings(
		columnId: string,
		filters: Parameters<typeof saveCustomTimelineSettingsConfig>[2],
		relays: Parameters<typeof saveCustomTimelineSettingsConfig>[3]
	) {
		setColumnConfigs(saveCustomTimelineSettingsConfig(columnConfigs, columnId, filters, relays));
		openSettingsColumnId = null;
	}

	function saveFollowSettings(columnId: string, profile: ProfilePointer) {
		setColumnConfigs(saveFollowSettingsConfig(columnConfigs, columnId, profile));
		openSettingsColumnId = null;
	}

	function saveSearchSettings(columnId: string, query: string) {
		setColumnConfigs(saveSearchSettingsConfig(columnConfigs, columnId, query));
		openSettingsColumnId = null;
	}

	function saveChannelSettings(columnId: string, channel: ChannelPointer) {
		setColumnConfigs(saveChannelSettingsConfig(columnConfigs, columnId, channel));
		openSettingsColumnId = null;
	}

	function getColumnIndex(columnId: string) {
		return columnConfigs.findIndex((column) => column.id === columnId);
	}

	function toggleColumnSettings(columnId: string) {
		openSettingsColumnId = openSettingsColumnId === columnId ? null : columnId;
	}

	function updateFontSize(nextFontSize: FontSize) {
		fontSize = nextFontSize;
	}

	function updateAvatarShape(nextAvatarShape: AvatarShape) {
		avatarShape = nextAvatarShape;
	}
</script>

<svelte:window onkeydown={handleKeyboardNavigation} onfocusin={handleFocusIn} />

<svelte:head>
	<title>{m.app_title()}</title>
</svelte:head>

<main
	class="app-shell flex min-h-0 overflow-hidden bg-[#eef3f7] text-slate-950 dark:bg-slate-950 dark:text-slate-50"
>
	<Sidebar
		columns={columnConfigs}
		decks={columnDeckStore.decks}
		activeDeckId={columnDeckStore.activeDeckId}
		{activeColumnId}
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
		onSelectDeck={selectDeck}
		onCreateDeck={createDeck}
		onRenameDeck={renameDeck}
		onDuplicateDeck={duplicateDeck}
		onDeleteDeck={deleteDeck}
		onCompose={toggleComposePanel}
		{fontSize}
		{avatarShape}
		{textClass}
		onFontSizeChange={updateFontSize}
		onAvatarShapeChange={updateAvatarShape}
		onSelectColumn={focusColumn}
		onReorderColumn={reorderColumn}
		{mutedPubkeys}
		{getProfile}
		{requestProfiles}
		profileRelays={defaultProfileRelays}
		onUnmuteUser={unmuteUser}
	/>

	{#if isLoggedIn && isComposePanelOpen}
		<section
			class="flex h-full w-[360px] shrink-0 flex-col border-r border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950"
			aria-labelledby="compose-panel-title"
			data-compose-panel
		>
			<header
				class="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 px-3 py-2.5 dark:border-slate-800"
			>
				<div class="flex min-w-0 items-center gap-2">
					<Send class="size-4 shrink-0 text-sky-500" aria-hidden="true" />
					<h2 id="compose-panel-title" class={['min-w-0 truncate font-bold', textClass.heading]}>
						{m.action_post()}
					</h2>
				</div>
				<button
					type="button"
					class="flex size-8 items-center justify-center rounded-md text-slate-500 transition hover:bg-slate-100 hover:text-slate-950 dark:text-slate-400 dark:hover:bg-slate-900 dark:hover:text-slate-50"
					title={m.close()}
					aria-label={m.close()}
					onclick={closeComposePanel}
				>
					<X class="size-4" aria-hidden="true" />
				</button>
			</header>

			<div
				class="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain p-4"
				data-testid="compose-panel-scroll"
			>
				<div class="mb-3 flex shrink-0 items-center gap-3">
					<ProfileAvatar
						shape={avatarShape}
						sizeClass="size-9"
						imageUrl={accountProfile?.picture}
						fallbackClass="bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-950"
						testId="account-avatar"
					>
						<UserRound class="size-4" aria-hidden="true" />
					</ProfileAvatar>
					<p class={['min-w-0 truncate font-bold', textClass.control]}>{accountName}</p>
				</div>

				<label class="sr-only" for="compose-text">{m.post_text()}</label>
				<textarea
					id="compose-text"
					class={[
						'min-h-[220px] flex-1 resize-none rounded-md border border-slate-200 bg-white p-3 text-slate-950 transition outline-none placeholder:text-slate-400 focus:border-sky-500 focus:ring-2 focus:ring-sky-100 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-50 dark:placeholder:text-slate-500 dark:focus:border-sky-400 dark:focus:ring-sky-950',
						textClass.textarea
					]}
					placeholder={m.compose_placeholder()}
					disabled={isPublishing}
					aria-keyshortcuts="Control+Enter Meta+Enter"
					bind:this={composeTextarea}
					bind:value={composeText}
					onkeydown={handleComposeKeydown}
				></textarea>

				<div class="mt-3 flex items-center gap-1">
					<button
						type="button"
						class="flex size-9 cursor-not-allowed items-center justify-center rounded-md text-slate-400 dark:text-slate-600"
						title={m.coming_soon()}
						aria-label={m.add_media()}
						disabled
					>
						<Image class="size-4" aria-hidden="true" />
					</button>
					<button
						type="button"
						class="flex size-9 cursor-not-allowed items-center justify-center rounded-md text-slate-400 dark:text-slate-600"
						title={m.coming_soon()}
						aria-label={m.add_emoji()}
						disabled
					>
						<Smile class="size-4" aria-hidden="true" />
					</button>
					<button
						type="button"
						class="flex size-9 cursor-not-allowed items-center justify-center rounded-md text-slate-400 dark:text-slate-600"
						title={m.coming_soon()}
						aria-label={m.schedule_post()}
						disabled
					>
						<CalendarClock class="size-4" aria-hidden="true" />
					</button>
				</div>

				{#if publishError}
					<p class={['mt-3 text-rose-600 dark:text-rose-400', textClass.control]} role="alert">
						{m.post_failed()}
					</p>
				{/if}

				<div class="mt-4 flex justify-end">
					<button
						type="button"
						class={[
							'h-10 rounded-md bg-sky-500 px-4 font-bold text-white transition hover:bg-sky-600 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500 dark:bg-sky-400 dark:text-slate-950 dark:hover:bg-sky-300 disabled:dark:bg-slate-800 disabled:dark:text-slate-500',
							textClass.control
						]}
						disabled={!canSubmitPost}
						onclick={publishPost}
					>
						{isPublishing ? m.post_sending() : m.action_post()}
					</button>
				</div>
			</div>
		</section>
	{/if}

	<section class="flex min-w-0 flex-1 flex-col">
		<div class="min-h-0 flex-1 overflow-x-auto overflow-y-hidden">
			<div class="flex h-full min-w-max">
				{#each columnConfigs as column (column.id)}
					{@const columnIndex = getColumnIndex(column.id)}
					<DeckColumn
						{column}
						runtime={timelineController.runtimes[column.id] ?? emptyColumnRuntime}
						id={getColumnId(column.id)}
						{isLoggedIn}
						isSettingsOpen={openSettingsColumnId === column.id}
						canMoveLeft={columnIndex > 0}
						canMoveRight={columnIndex >= 0 && columnIndex < columnConfigs.length - 1}
						{textClass}
						{avatarShape}
						{getProfile}
						{requestProfiles}
						profileRelays={defaultProfileRelays}
						{isMutedUser}
						onMuteUser={muteUser}
						onOpenProfile={(profile) => void detailController.openProfile(column.id, profile)}
						onOpenThread={(post) => void detailController.openThread(column.id, post)}
						onOpenHashtag={(hashtag) => void openHashtagColumn(column.id, hashtag)}
						onToggleSettings={() => toggleColumnSettings(column.id)}
						onDelete={() => deleteColumn(column.id)}
						onMoveLeft={() => moveColumn(column.id, -1)}
						onMoveRight={() => moveColumn(column.id, 1)}
						onTitleChange={(title) => updateColumnTitle(column.id, title)}
						onIconChange={(icon) => updateColumnIcon(column.id, icon)}
						onWidthChange={(width) => updateColumnWidth(column.id, width)}
						onFollowSave={(profile) => saveFollowSettings(column.id, profile)}
						onSearchSave={(query) => saveSearchSettings(column.id, query)}
						onChannelSave={(channel) => saveChannelSettings(column.id, channel)}
						onPublishChannelMessage={publishChannelPost}
						onCustomTimelineSave={(filters, relays) =>
							saveCustomTimelineSettings(column.id, filters, relays)}
						onLoadOlderTimeline={() => void timelineController.loadOlder(column.id)}
						onLoadNewerTimeline={() => void timelineController.loadNewer(column.id)}
					/>
					{#if detailController.detailColumn?.sourceColumnId === column.id}
						{#if detailController.detailColumn.type === 'thread'}
							<ThreadColumn
								id={getColumnId('thread')}
								posts={detailController.threadPosts}
								isLoading={detailController.isThreadLoading}
								error={detailController.threadError}
								{isLoggedIn}
								{textClass}
								{avatarShape}
								{getProfile}
								{requestProfiles}
								profileRelays={defaultProfileRelays}
								{isMutedUser}
								onMuteUser={muteUser}
								onClose={() => void detailController.close()}
								onOpenProfile={(profile) => void detailController.openProfile(column.id, profile)}
								onOpenThread={(post) => void detailController.openThread(column.id, post)}
								onOpenHashtag={(hashtag) => void openHashtagColumn(column.id, hashtag)}
							/>
						{:else}
							<ProfileColumn
								id={getColumnId('profile')}
								pubkey={detailController.detailColumn.pubkey}
								posts={detailController.profilePosts}
								isLoading={detailController.profileRuntime.isLoading}
								error={detailController.profileRuntime.error}
								{isLoggedIn}
								{textClass}
								{avatarShape}
								{getProfile}
								{requestProfiles}
								profileRelays={defaultProfileRelays}
								{isMutedUser}
								onMuteUser={muteUser}
								onClose={() => void detailController.close()}
								onOpenProfile={(profile) => void detailController.openProfile(column.id, profile)}
								onOpenThread={(post) => void detailController.openThread(column.id, post)}
								onOpenHashtag={(hashtag) => void openHashtagColumn(column.id, hashtag)}
							/>
						{/if}
					{/if}
				{/each}
				{#if columnConfigs.length === 0}
					<div
						data-testid="column-add-placeholder"
						class="flex h-full w-[342px] shrink-0 flex-col items-center justify-center gap-3 border-r border-dashed border-slate-300 bg-white/60 px-4 text-slate-500 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-400"
					>
						<button
							type="button"
							class="flex size-11 items-center justify-center rounded-md border border-slate-300 bg-white transition hover:border-slate-400 hover:text-slate-950 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-slate-600 dark:hover:text-slate-50"
							title={m.add_column()}
							aria-label={m.add_column()}
							onclick={openAddColumnDialog}
						>
							<Plus class="size-5" aria-hidden="true" />
						</button>
						<span class={['font-semibold', textClass.control]}>{m.add_column()}</span>
					</div>
				{/if}
			</div>
		</div>
	</section>
</main>

<AddColumnDialog
	bind:isOpen={isColumnDialogOpen}
	{textClass}
	createColumnId={() => createColumnId(columnConfigs)}
	onSave={(column) => void saveColumn(column)}
/>

<KeyboardShortcutsDialog bind:isOpen={isKeyboardShortcutsDialogOpen} {textClass} />
