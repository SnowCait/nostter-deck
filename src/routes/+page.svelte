<script lang="ts">
	import { onDestroy, onMount, tick } from 'svelte';
	import { CalendarClock, Image, Plus, Send, Smile, UserRound } from '@lucide/svelte';
	import AddColumnDialog from '$lib/components/deck/AddColumnDialog.svelte';
	import DeckColumn from '$lib/components/deck/DeckColumn.svelte';
	import ProfileColumn from '$lib/components/deck/ProfileColumn.svelte';
	import ThreadColumn from '$lib/components/deck/ThreadColumn.svelte';
	import ProfileAvatar from '$lib/components/deck/ProfileAvatar.svelte';
	import Sidebar from '$lib/components/deck/Sidebar.svelte';
	import { readColumnConfigs, writeColumnConfigs } from '$lib/deck/column-configs';
	import {
		emptyTimelineRuntime,
		getTimelineRequest,
		toRuntimeColumn
	} from '$lib/deck/timeline-runtime';
	import { resetSessionTimelineCache } from '$lib/deck/timeline-cache';
	import { createTimelineController } from '$lib/deck/timeline-controller.svelte';
	import type {
		Column,
		ColumnConfig,
		ColumnIconKey,
		ColumnWidth,
		Post,
		ThreadPost
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
	import { eventToPost, getThreadReference } from '$lib/nostr/posts';
	import {
		combineRelays,
		defaultRelays,
		profileRelays,
		resolveRelaySelection
	} from '$lib/nostr/relays';
	import { buildThreadEvents, startThreadSubscription } from '$lib/nostr/thread';
	import { m } from '$lib/paraglide/messages.js';
	import { readUserSettings, type AvatarShape, type FontSize } from '$lib/user-settings';
	import type * as Nostr from 'nostr-typedef';

	type NostrDeckGlobal = typeof globalThis & {
		__NOSTTER_DECK_IS_LOGGED_IN__?: boolean;
	};

	type DetailColumn =
		| { type: 'thread'; sourceColumnId: string; eventId: string }
		| { type: 'profile'; sourceColumnId: string; pubkey: string };

	const savedColumnConfigs = readColumnConfigs();
	const isLoggedIn = (globalThis as NostrDeckGlobal).__NOSTTER_DECK_IS_LOGGED_IN__ === true;
	const defaultProfileRelays = [...profileRelays];

	let columnConfigs = $state<ColumnConfig[]>(savedColumnConfigs.map((column) => ({ ...column })));
	let activeColumnId = $state(savedColumnConfigs[0]?.id ?? '');
	let isColumnDialogOpen = $state(false);
	let openSettingsColumnId = $state<string | null>(null);
	let isComposePanelOpen = $state(false);
	let composeText = $state('');
	const initialUserSettings = readUserSettings();
	let fontSize = $state<FontSize>(initialUserSettings.fontSize);
	let avatarShape = $state<AvatarShape>(initialUserSettings.avatarShape);
	let isTimelineCacheReady = $state(false);
	let detailColumn = $state<DetailColumn | null>(null);
	let threadSelectedEvent = $state<Nostr.Event | null>(null);
	let threadEvents = $state<Nostr.Event[]>([]);
	let isThreadLoading = $state(false);
	let threadError = $state<string | null>(null);
	let threadSubscription: { stop: () => void } | null = null;
	let threadRequestId = 0;
	let mutedPubkeys = $state(readMutedPubkeys());

	const composeMaxLength = 280;
	const composeLength = $derived(composeText.length);
	const canSubmitPost = $derived(composeLength > 0 && composeLength <= composeMaxLength);
	const textClass = $derived(textClassByFontSize[fontSize]);
	const timelineController = createTimelineController({
		getColumnConfigs: () => columnConfigs,
		isReady: () => isTimelineCacheReady
	});
	const columns = $derived<Column[]>(
		columnConfigs.map((column) =>
			toRuntimeColumn(
				column,
				timelineController.runtimes[column.id] ?? emptyTimelineRuntime(),
				getProfile,
				isMutedUser
			)
		)
	);
	const threadPosts = $derived<ThreadPost[]>(
		threadSelectedEvent
			? buildThreadEvents(
					threadEvents,
					getThreadReference(threadSelectedEvent)?.rootId ?? threadSelectedEvent.id
				).map(({ event, depth }) => ({
					post: eventToPost(event, getProfile(event.pubkey)),
					depth,
					isMuted: isMutedUser(event.pubkey)
				}))
			: []
	);

	onMount(() => {
		void resetSessionTimelineCache().then(() => {
			isTimelineCacheReady = true;
		});
	});

	onDestroy(() => {
		timelineController.stop();
		threadSubscription?.stop();
	});

	function getColumnId(columnId: string) {
		return `deck-column-${columnId}`;
	}

	function focusColumn(columnId: string) {
		activeColumnId = columnId;

		const columnElement = document.getElementById(getColumnId(columnId));
		columnElement?.scrollIntoView({
			behavior: 'smooth',
			block: 'nearest',
			inline: 'nearest'
		});
		columnElement?.focus({ preventScroll: true });
	}

	function createColumnId(columns: ColumnConfig[]) {
		const columnIds = new Set(columns.map((column) => column.id));

		while (true) {
			const id = crypto.randomUUID();
			if (!columnIds.has(id)) return id;
		}
	}

	function setColumnConfigs(nextColumnConfigs: ColumnConfig[]) {
		columnConfigs = nextColumnConfigs;
		writeColumnConfigs(nextColumnConfigs);
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

	function toggleComposePanel() {
		if (!isLoggedIn) return;

		isComposePanelOpen = !isComposePanelOpen;
	}

	function closeComposePanel() {
		isComposePanelOpen = false;
	}

	async function saveColumn(column: ColumnConfig) {
		setColumnConfigs([...columnConfigs, column]);
		await tick();
		focusColumn(column.id);
	}

	async function deleteColumn(columnId: string) {
		const deletedIndex = columnConfigs.findIndex((column) => column.id === columnId);
		if (deletedIndex < 0) return;

		const nextColumns = columnConfigs.filter((column) => column.id !== columnId);
		setColumnConfigs(nextColumns);
		if (detailColumn?.sourceColumnId === columnId) closeDetailColumn(false);
		openSettingsColumnId = null;

		if (activeColumnId !== columnId) return;

		const nextActiveColumn = nextColumns[Math.min(deletedIndex, nextColumns.length - 1)];
		activeColumnId = nextActiveColumn?.id ?? '';

		if (nextActiveColumn) {
			await tick();
			focusColumn(nextActiveColumn.id);
		}
	}

	async function openThreadColumn(sourceColumnId: string, post: Post) {
		if (!post.thread) return;
		if (detailColumn?.type === 'thread' && detailColumn.eventId === post.thread.event.id) {
			await closeDetailColumn();
			return;
		}

		threadSubscription?.stop();
		const requestId = ++threadRequestId;
		detailColumn = { type: 'thread', sourceColumnId, eventId: post.thread.event.id };
		threadSelectedEvent = post.thread.event;
		threadEvents = [post.thread.event];
		threadError = null;
		isThreadLoading = true;

		const sourceColumn = columnConfigs.find((column) => column.id === sourceColumnId);
		const request = sourceColumn ? getTimelineRequest(sourceColumn) : null;
		const relays = request ? resolveRelaySelection(request.relays) : [];
		threadSubscription = startThreadSubscription({
			selectedEvent: post.thread.event,
			relays,
			onEvents: (events) => {
				if (threadRequestId !== requestId) return;
				threadEvents = events;
			},
			onLoadingChange: (isLoading) => {
				if (threadRequestId !== requestId) return;
				isThreadLoading = isLoading;
			},
			onError: (message) => {
				if (threadRequestId !== requestId) return;
				threadError = message;
				isThreadLoading = false;
			}
		});

		await tick();
		focusColumn('thread');
	}

	async function openProfileColumn(sourceColumnId: string, profile: ProfilePointer) {
		if (detailColumn?.type === 'profile' && detailColumn.pubkey === profile.pubkey) {
			await closeDetailColumn();
			return;
		}

		threadRequestId += 1;
		threadSubscription?.stop();
		threadSubscription = null;
		threadSelectedEvent = null;
		threadEvents = [];
		threadError = null;
		isThreadLoading = false;

		const sourceColumn = columnConfigs.find((column) => column.id === sourceColumnId);
		const request = sourceColumn ? getTimelineRequest(sourceColumn) : null;
		const sourceRelays = request ? resolveRelaySelection(request.relays) : [];
		requestProfiles(
			[profile.pubkey],
			combineRelays(sourceRelays, profile.relays, [...defaultRelays], defaultProfileRelays)
		);
		detailColumn = { type: 'profile', sourceColumnId, pubkey: profile.pubkey };

		await tick();
		focusColumn('profile');
	}

	async function closeDetailColumn(restoreFocus = true) {
		const sourceColumnId = detailColumn?.sourceColumnId;
		threadRequestId += 1;
		threadSubscription?.stop();
		threadSubscription = null;
		detailColumn = null;
		threadSelectedEvent = null;
		threadEvents = [];
		threadError = null;
		isThreadLoading = false;

		if (restoreFocus && sourceColumnId && columnConfigs.some(({ id }) => id === sourceColumnId)) {
			await tick();
			focusColumn(sourceColumnId);
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

<svelte:head>
	<title>{m.app_title()}</title>
</svelte:head>

<main
	class="app-shell flex min-h-0 overflow-hidden bg-[#eef3f7] text-slate-950 dark:bg-slate-950 dark:text-slate-50"
>
	<Sidebar
		{columns}
		{activeColumnId}
		{isLoggedIn}
		onAddColumn={openAddColumnDialog}
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
		>
			<header
				class="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-800"
			>
				<div class="flex min-w-0 items-center gap-2">
					<Send class="size-4 shrink-0 text-sky-500" aria-hidden="true" />
					<h2 id="compose-panel-title" class={['min-w-0 truncate font-bold', textClass.heading]}>
						{m.action_post()}
					</h2>
				</div>
				<button
					type="button"
					class={[
						'h-9 rounded-md px-3 font-semibold text-slate-600 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-900',
						textClass.control
					]}
					onclick={closeComposePanel}
				>
					{m.close()}
				</button>
			</header>

			<div
				class="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain p-4"
				data-testid="compose-panel-scroll"
			>
				<div
					class="mb-4 flex items-center gap-3 rounded-md border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900"
				>
					<ProfileAvatar
						shape={avatarShape}
						sizeClass="size-10"
						fallbackClass="bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-950"
						testId="account-avatar"
					>
						<UserRound class="size-4" aria-hidden="true" />
					</ProfileAvatar>
					<div class="min-w-0">
						<p class={['truncate font-bold', textClass.control]}>Mika</p>
						<p class={['truncate text-slate-500 dark:text-slate-400', textClass.meta]}>
							@mika · {m.account_role()}
						</p>
					</div>
				</div>

				<label class="sr-only" for="compose-text">{m.post_text()}</label>
				<textarea
					id="compose-text"
					class={[
						'min-h-[220px] flex-1 resize-none rounded-md border border-slate-200 bg-white p-3 text-slate-950 transition outline-none placeholder:text-slate-400 focus:border-sky-500 focus:ring-2 focus:ring-sky-100 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-50 dark:placeholder:text-slate-500 dark:focus:border-sky-400 dark:focus:ring-sky-950',
						textClass.textarea
					]}
					placeholder={m.compose_placeholder()}
					bind:value={composeText}
				></textarea>

				<div class="mt-3 flex items-center justify-between gap-3">
					<div class="flex items-center gap-1">
						<button
							type="button"
							class="flex size-9 items-center justify-center rounded-md text-slate-500 transition hover:bg-sky-50 hover:text-sky-600 dark:text-slate-400 dark:hover:bg-sky-950/40 dark:hover:text-sky-300"
							title={m.add_media()}
							aria-label={m.add_media()}
						>
							<Image class="size-4" aria-hidden="true" />
						</button>
						<button
							type="button"
							class="flex size-9 items-center justify-center rounded-md text-slate-500 transition hover:bg-sky-50 hover:text-sky-600 dark:text-slate-400 dark:hover:bg-sky-950/40 dark:hover:text-sky-300"
							title={m.add_emoji()}
							aria-label={m.add_emoji()}
						>
							<Smile class="size-4" aria-hidden="true" />
						</button>
						<button
							type="button"
							class="flex size-9 items-center justify-center rounded-md text-slate-500 transition hover:bg-sky-50 hover:text-sky-600 dark:text-slate-400 dark:hover:bg-sky-950/40 dark:hover:text-sky-300"
							title={m.schedule_post()}
							aria-label={m.schedule_post()}
						>
							<CalendarClock class="size-4" aria-hidden="true" />
						</button>
					</div>

					<p
						class={[
							'font-semibold tabular-nums',
							textClass.control,
							composeLength > composeMaxLength
								? 'text-rose-600 dark:text-rose-400'
								: 'text-slate-500 dark:text-slate-400'
						]}
						aria-live="polite"
					>
						{composeLength} / {composeMaxLength}
					</p>
				</div>

				<div class="mt-4 flex justify-end">
					<button
						type="button"
						class={[
							'h-10 rounded-md bg-sky-500 px-4 font-bold text-white transition hover:bg-sky-600 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500 dark:bg-sky-400 dark:text-slate-950 dark:hover:bg-sky-300 disabled:dark:bg-slate-800 disabled:dark:text-slate-500',
							textClass.control
						]}
						disabled={!canSubmitPost}
					>
						{m.action_post()}
					</button>
				</div>
			</div>
		</section>
	{/if}

	<section class="flex min-w-0 flex-1 flex-col">
		<div class="min-h-0 flex-1 overflow-x-auto overflow-y-hidden">
			<div class="flex h-full min-w-max">
				{#each columns as column (column.id)}
					{@const columnIndex = getColumnIndex(column.id)}
					<DeckColumn
						{column}
						id={getColumnId(column.id)}
						{isLoggedIn}
						isFocused={activeColumnId === column.id}
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
						onOpenProfile={(profile) => void openProfileColumn(column.id, profile)}
						onOpenThread={(post) => void openThreadColumn(column.id, post)}
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
						onCustomTimelineSave={(filters, relays) =>
							saveCustomTimelineSettings(column.id, filters, relays)}
						onLoadOlderTimeline={() => void timelineController.loadOlder(column.id)}
						onLoadNewerTimeline={() => void timelineController.loadNewer(column.id)}
					/>
					{#if detailColumn?.sourceColumnId === column.id}
						{#if detailColumn.type === 'thread'}
							<ThreadColumn
								id={getColumnId('thread')}
								posts={threadPosts}
								isLoading={isThreadLoading}
								error={threadError}
								{isLoggedIn}
								{textClass}
								{avatarShape}
								{getProfile}
								{requestProfiles}
								profileRelays={defaultProfileRelays}
								{isMutedUser}
								onMuteUser={muteUser}
								onClose={() => void closeDetailColumn()}
								onOpenProfile={(profile) => void openProfileColumn(column.id, profile)}
								onOpenThread={(post) => void openThreadColumn(column.id, post)}
							/>
						{:else}
							<ProfileColumn
								id={getColumnId('profile')}
								pubkey={detailColumn.pubkey}
								{textClass}
								{avatarShape}
								{getProfile}
								onClose={() => void closeDetailColumn()}
							/>
						{/if}
					{/if}
				{/each}
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
