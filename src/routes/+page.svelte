<script lang="ts">
	import { onDestroy, onMount, tick } from 'svelte';
	import { CalendarClock, Image, Plus, Send, Smile, UserRound } from '@lucide/svelte';
	import DeckColumn from '$lib/components/deck/DeckColumn.svelte';
	import FilterHelpButton from '$lib/components/deck/FilterHelpButton.svelte';
	import ProfileAvatar from '$lib/components/deck/ProfileAvatar.svelte';
	import Sidebar from '$lib/components/deck/Sidebar.svelte';
	import { createColumnConfigFromDraft, type AddColumnType } from '$lib/deck/add-column';
	import { getDefaultColumnIconKey } from '$lib/deck/column-icons';
	import { readColumnConfigs, writeColumnConfigs } from '$lib/deck/column-configs';
	import { columnSourceKeys } from '$lib/deck/data';
	import {
		emptyTimelineRuntime,
		getRepostedEventId,
		getTimelineRequest,
		getTimelineSignature,
		isFetchableTimelineColumn,
		maxVisibleTimelineEvents,
		mergeTimelineEventIds,
		timelinePageSize,
		toRuntimeColumn,
		type TimelineRuntime
	} from '$lib/deck/timeline-runtime';
	import {
		clearTimelineColumn,
		hasNewerTimelineEvents,
		hasOlderTimelineEvents,
		loadEventsByIds,
		loadNewerTimelineEvents,
		loadOlderTimelineEvents,
		resetSessionTimelineCache,
		storeEvent,
		storeTimelineEvent
	} from '$lib/deck/timeline-cache';
	import type {
		Column,
		ColumnConfig,
		ColumnIconKey,
		ColumnWidth,
		NostrFilter,
		RelaySelection
	} from '$lib/deck/types';
	import { normalizeWebsiteUrl } from '$lib/deck/website-url';
	import { textClassByFontSize } from '$lib/font-size';
	import * as Dialog from '$lib/components/ui/dialog';
	import { parseNostrFilters } from '$lib/nostr/filters';
	import { decodeProfilePointer, type ProfilePointer } from '$lib/nostr/nip19';
	import { getProfile, requestProfiles } from '$lib/nostr/profiles';
	import { defaultRelays, profileRelays, resolveRelayDraft } from '$lib/nostr/relays';
	import { startCustomTimelineSubscription, type TimelineEventPhase } from '$lib/nostr/timeline';
	import { m } from '$lib/paraglide/messages.js';
	import { readUserSettings, type AvatarShape, type FontSize } from '$lib/user-settings';
	import type * as Nostr from 'nostr-typedef';

	type CustomTimelineSubscription = {
		signature: string;
		stop: () => void;
	};

	type NostrDeckGlobal = typeof globalThis & {
		__NOSTTER_DECK_IS_LOGGED_IN__?: boolean;
	};

	const savedColumnConfigs = readColumnConfigs();
	const isLoggedIn = (globalThis as NostrDeckGlobal).__NOSTTER_DECK_IS_LOGGED_IN__ === true;
	const availableColumnSourceKeys = columnSourceKeys;
	const defaultProfileRelays = [...profileRelays];
	const defaultColumnType = availableColumnSourceKeys[0] ?? 'timeline_search';

	let columnConfigs = $state<ColumnConfig[]>(savedColumnConfigs.map((column) => ({ ...column })));
	let activeColumnId = $state(savedColumnConfigs[0]?.id ?? '');
	let isColumnDialogOpen = $state(false);
	let openSettingsColumnId = $state<string | null>(null);
	let isComposePanelOpen = $state(false);
	let composeText = $state('');
	const initialUserSettings = readUserSettings();
	let fontSize = $state<FontSize>(initialUserSettings.fontSize);
	let avatarShape = $state<AvatarShape>(initialUserSettings.avatarShape);
	let selectedColumnType = $state<AddColumnType>(defaultColumnType);
	let websiteUrl = $state('');
	let followTarget = $state('');
	let searchQuery = $state('');
	let customTimelineFilters = $state('[{"kinds":[1],"limit":20}]');
	let selectedDefaultRelays = $state<string[]>([...defaultRelays]);
	let customTimelineRelays = $state('');
	let customTimelineRuntimes = $state<Record<string, TimelineRuntime>>({});
	let isTimelineCacheReady = $state(false);
	// eslint-disable-next-line svelte/prefer-svelte-reactivity
	const customTimelineSubscriptions = new Map<string, CustomTimelineSubscription>();

	const composeMaxLength = 280;
	const composeLength = $derived(composeText.length);
	const canSubmitPost = $derived(composeLength > 0 && composeLength <= composeMaxLength);
	const textClass = $derived(textClassByFontSize[fontSize]);
	const normalizedWebsiteUrl = $derived(normalizeWebsiteUrl(websiteUrl));
	const parsedFollowTarget = $derived(decodeProfilePointer(followTarget));
	const parsedCustomTimelineFilters = $derived(parseNostrFilters(customTimelineFilters));
	const selectedDefaultRelaySet = $derived(new Set(selectedDefaultRelays));
	const parsedCustomTimelineRelays = $derived(
		resolveRelayDraft(selectedDefaultRelays, customTimelineRelays)
	);
	const canSaveColumn = $derived(createColumnConfigFromDraft(getColumnDraft('')) !== null);
	const columns = $derived<Column[]>(
		columnConfigs.map((column) =>
			toRuntimeColumn(
				column,
				customTimelineRuntimes[column.id] ?? emptyTimelineRuntime(),
				getProfile
			)
		)
	);

	$effect(() => {
		if (!isTimelineCacheReady) return;

		const activeTimelineColumns = columnConfigs.filter(isFetchableTimelineColumn);
		const activeTimelineColumnIds = new Set(activeTimelineColumns.map((column) => column.id));

		for (const [columnId, subscription] of customTimelineSubscriptions) {
			if (activeTimelineColumnIds.has(columnId)) continue;

			subscription.stop();
			customTimelineSubscriptions.delete(columnId);
			removeCustomTimelineRuntime(columnId);
		}

		for (const column of activeTimelineColumns) {
			const request = getTimelineRequest(column);
			if (!request) continue;

			const filters = $state.snapshot(request.filters);
			const relays = $state.snapshot(request.relays);
			const signature = getTimelineSignature({ filters, relays });
			if (customTimelineSubscriptions.get(column.id)?.signature === signature) continue;

			customTimelineSubscriptions.get(column.id)?.stop();
			void clearTimelineColumn(column.id, signature);
			setCustomTimelineRuntime(column.id, emptyTimelineRuntime(signature));

			const subscription = startCustomTimelineSubscription({
				filters,
				relays,
				onEvent: (event, { phase }) => addCustomTimelineEvent(column.id, signature, event, phase),
				onRepostedEvent: (repostEventId, event) =>
					addCustomTimelineRepostedEvent(column.id, repostEventId, event),
				onLoadingChange: (isLoading) => updateCustomTimelineRuntime(column.id, { isLoading }),
				onError: (error) => updateCustomTimelineRuntime(column.id, { error })
			});

			customTimelineSubscriptions.set(column.id, {
				signature,
				stop: subscription.stop
			});
		}
	});

	onMount(() => {
		void resetSessionTimelineCache().then(() => {
			isTimelineCacheReady = true;
		});
	});

	onDestroy(() => {
		for (const subscription of customTimelineSubscriptions.values()) {
			subscription.stop();
		}
		customTimelineSubscriptions.clear();
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
			inline: 'start'
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

	function setCustomTimelineRuntime(columnId: string, runtime: TimelineRuntime) {
		customTimelineRuntimes = {
			...customTimelineRuntimes,
			[columnId]: runtime
		};
	}

	function updateCustomTimelineRuntime(columnId: string, patch: Partial<TimelineRuntime>) {
		customTimelineRuntimes = {
			...customTimelineRuntimes,
			[columnId]: {
				...(customTimelineRuntimes[columnId] ?? emptyTimelineRuntime()),
				...patch
			}
		};
	}

	function removeCustomTimelineRuntime(columnId: string) {
		const nextRuntimes = { ...customTimelineRuntimes };
		delete nextRuntimes[columnId];
		customTimelineRuntimes = nextRuntimes;
		void clearTimelineColumn(columnId);
	}

	function addCustomTimelineEvent(
		columnId: string,
		timelineKey: string,
		event: Nostr.Event,
		phase: TimelineEventPhase
	) {
		void storeTimelineEvent(columnId, timelineKey, event);
		const runtime = customTimelineRuntimes[columnId] ?? emptyTimelineRuntime();
		if (runtime.timelineKey !== timelineKey) return;
		if (runtime.hasNewerStored) return;

		const liveEventIds =
			phase === 'live'
				? [event.id, ...runtime.liveEventIds.filter((eventId) => eventId !== event.id)]
				: runtime.liveEventIds;
		const runtimeWithEvent = {
			...runtime,
			liveEventIds,
			loadedEventsById: {
				...runtime.loadedEventsById,
				[event.id]: event
			}
		};
		const nextVisibleEventIds =
			phase === 'live'
				? mergeVisibleEventIds(runtimeWithEvent, [event.id, ...runtimeWithEvent.visibleEventIds])
				: insertVisibleEventId(runtimeWithEvent, event.id);
		const trimmedVisibleEventIds = trimVisibleEventIds(nextVisibleEventIds, 'older');

		setCustomTimelineRuntime(
			columnId,
			pruneLoadedEvents({
				...runtimeWithEvent,
				visibleEventIds: trimmedVisibleEventIds,
				hasOlderStored:
					runtimeWithEvent.hasOlderStored ||
					nextVisibleEventIds.length > trimmedVisibleEventIds.length
			})
		);
		void hydrateReferencedEvents(columnId);
	}

	function addCustomTimelineRepostedEvent(
		columnId: string,
		repostEventId: string,
		event: Nostr.Event
	) {
		void storeEvent(event);
		const runtime = customTimelineRuntimes[columnId] ?? emptyTimelineRuntime();
		if (!runtime.visibleEventIds.includes(repostEventId)) return;

		customTimelineRuntimes = {
			...customTimelineRuntimes,
			[columnId]: {
				...runtime,
				loadedEventsById: {
					...runtime.loadedEventsById,
					[event.id]: event
				}
			}
		};
	}

	async function hydrateReferencedEvents(columnId: string) {
		const runtime = customTimelineRuntimes[columnId] ?? emptyTimelineRuntime();
		const referencedEventIds = getMissingReferencedEventIds(runtime);
		if (referencedEventIds.length === 0) return;

		const referencedEventsById = await loadEventsByIds(referencedEventIds);
		const currentRuntime = customTimelineRuntimes[columnId] ?? runtime;
		setCustomTimelineRuntime(
			columnId,
			pruneLoadedEvents({
				...currentRuntime,
				loadedEventsById: {
					...currentRuntime.loadedEventsById,
					...referencedEventsById
				}
			})
		);
	}

	async function loadOlderTimelineEventsFromCache(columnId: string) {
		const runtime = customTimelineRuntimes[columnId] ?? emptyTimelineRuntime();
		if (runtime.isLoadingOlder || !runtime.hasOlderStored) return;

		const cursor = getVisibleCursor(runtime, 'older');
		if (!cursor) return;

		updateCustomTimelineRuntime(columnId, { isLoadingOlder: true });
		const page = await loadOlderTimelineEvents(
			columnId,
			runtime.timelineKey,
			cursor,
			timelinePageSize
		);
		const currentRuntime = customTimelineRuntimes[columnId] ?? runtime;
		const runtimeWithPage = await withReferencedEvents({
			...currentRuntime,
			loadedEventsById: {
				...currentRuntime.loadedEventsById,
				...page.eventsById
			}
		});
		const nextVisibleEventIds = mergeVisibleEventIds(runtimeWithPage, [
			...runtimeWithPage.visibleEventIds,
			...page.entries.map((entry) => entry.eventId)
		]);
		const trimmedVisibleEventIds = trimVisibleEventIds(nextVisibleEventIds, 'newer');
		const tailCursor = getEventCursor(
			runtimeWithPage.loadedEventsById[trimmedVisibleEventIds.at(-1) ?? '']
		);

		setCustomTimelineRuntime(
			columnId,
			pruneLoadedEvents({
				...runtimeWithPage,
				visibleEventIds: trimmedVisibleEventIds,
				hasOlderStored: tailCursor
					? await hasOlderTimelineEvents(columnId, runtime.timelineKey, tailCursor)
					: false,
				hasNewerStored:
					runtimeWithPage.hasNewerStored ||
					nextVisibleEventIds.length > trimmedVisibleEventIds.length,
				isLoadingOlder: false
			})
		);
	}

	async function loadNewerTimelineEventsFromCache(columnId: string) {
		const runtime = customTimelineRuntimes[columnId] ?? emptyTimelineRuntime();
		if (runtime.isLoadingNewer || !runtime.hasNewerStored) return;

		const cursor = getVisibleCursor(runtime, 'newer');
		if (!cursor) return;

		updateCustomTimelineRuntime(columnId, { isLoadingNewer: true });
		const page = await loadNewerTimelineEvents(
			columnId,
			runtime.timelineKey,
			cursor,
			timelinePageSize
		);
		const currentRuntime = customTimelineRuntimes[columnId] ?? runtime;
		const runtimeWithPage = await withReferencedEvents({
			...currentRuntime,
			loadedEventsById: {
				...currentRuntime.loadedEventsById,
				...page.eventsById
			}
		});
		const nextVisibleEventIds = mergeVisibleEventIds(runtimeWithPage, [
			...page.entries.map((entry) => entry.eventId),
			...runtimeWithPage.visibleEventIds
		]);
		const trimmedVisibleEventIds = trimVisibleEventIds(nextVisibleEventIds, 'older');
		const headCursor = getEventCursor(
			runtimeWithPage.loadedEventsById[trimmedVisibleEventIds[0] ?? '']
		);

		setCustomTimelineRuntime(
			columnId,
			pruneLoadedEvents({
				...runtimeWithPage,
				visibleEventIds: trimmedVisibleEventIds,
				hasNewerStored: headCursor
					? await hasNewerTimelineEvents(columnId, runtime.timelineKey, headCursor)
					: false,
				hasOlderStored:
					runtimeWithPage.hasOlderStored ||
					nextVisibleEventIds.length > trimmedVisibleEventIds.length,
				isLoadingNewer: false
			})
		);
	}

	async function withReferencedEvents(runtime: TimelineRuntime): Promise<TimelineRuntime> {
		const referencedEventIds = getMissingReferencedEventIds(runtime);
		if (referencedEventIds.length === 0) return runtime;

		return {
			...runtime,
			loadedEventsById: {
				...runtime.loadedEventsById,
				...(await loadEventsByIds(referencedEventIds))
			}
		};
	}

	function getMissingReferencedEventIds(runtime: TimelineRuntime) {
		return runtime.visibleEventIds
			.map((eventId) => runtime.loadedEventsById[eventId])
			.flatMap((event) =>
				event ? [getRepostedEventId(event)].flatMap((id) => (id ? [id] : [])) : []
			)
			.filter((eventId) => !runtime.loadedEventsById[eventId]);
	}

	function insertVisibleEventId(runtime: TimelineRuntime, eventId: string) {
		return mergeVisibleEventIds(runtime, [...runtime.visibleEventIds, eventId]);
	}

	function mergeVisibleEventIds(runtime: TimelineRuntime, eventIds: string[]) {
		return mergeTimelineEventIds(runtime, eventIds);
	}

	function trimVisibleEventIds(eventIds: string[], trimSide: 'newer' | 'older') {
		if (eventIds.length <= maxVisibleTimelineEvents) return eventIds;

		return trimSide === 'newer'
			? eventIds.slice(eventIds.length - maxVisibleTimelineEvents)
			: eventIds.slice(0, maxVisibleTimelineEvents);
	}

	function getVisibleCursor(runtime: TimelineRuntime, side: 'newer' | 'older') {
		const eventId = side === 'newer' ? runtime.visibleEventIds[0] : runtime.visibleEventIds.at(-1);
		return getEventCursor(runtime.loadedEventsById[eventId ?? '']);
	}

	function getEventCursor(event?: Nostr.Event) {
		return event ? { createdAt: event.created_at, eventId: event.id } : null;
	}

	function pruneLoadedEvents(runtime: TimelineRuntime): TimelineRuntime {
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- local lookup, not component state
		const retainedEventIds = new Set(runtime.visibleEventIds);
		for (const eventId of runtime.visibleEventIds) {
			const referencedEventId = getRepostedEventId(runtime.loadedEventsById[eventId]);
			if (referencedEventId) retainedEventIds.add(referencedEventId);
		}

		return {
			...runtime,
			liveEventIds: runtime.liveEventIds.filter((eventId) => retainedEventIds.has(eventId)),
			loadedEventsById: Object.fromEntries(
				Object.entries(runtime.loadedEventsById).filter(([eventId]) =>
					retainedEventIds.has(eventId)
				)
			)
		};
	}

	function getColumnDraft(id: string) {
		return {
			id,
			columnType: selectedColumnType,
			websiteUrl: normalizedWebsiteUrl,
			followTarget: parsedFollowTarget,
			searchQuery,
			customTimelineFilters: parsedCustomTimelineFilters,
			customTimelineRelays: parsedCustomTimelineRelays
		};
	}

	function openAddColumnDialog() {
		selectedColumnType = defaultColumnType;
		websiteUrl = '';
		followTarget = '';
		searchQuery = '';
		customTimelineFilters = '[{"kinds":[1],"limit":20}]';
		selectedDefaultRelays = [...defaultRelays];
		customTimelineRelays = '';
		isColumnDialogOpen = true;
	}

	function closeColumnDialog() {
		isColumnDialogOpen = false;
	}

	function toggleComposePanel() {
		if (!isLoggedIn) return;

		isComposePanelOpen = !isComposePanelOpen;
	}

	function closeComposePanel() {
		isComposePanelOpen = false;
	}

	async function saveColumnDialog() {
		if (!canSaveColumn) return;

		const id = createColumnId(columnConfigs);
		const nextColumn = createColumnConfigFromDraft(getColumnDraft(id));
		if (!nextColumn) return;

		setColumnConfigs([...columnConfigs, nextColumn]);
		closeColumnDialog();
		await tick();
		focusColumn(id);
	}

	async function deleteColumn(columnId: string) {
		const deletedIndex = columnConfigs.findIndex((column) => column.id === columnId);
		if (deletedIndex < 0) return;

		const nextColumns = columnConfigs.filter((column) => column.id !== columnId);
		setColumnConfigs(nextColumns);
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

	function updateColumnWidth(columnId: string, width: ColumnWidth) {
		setColumnConfigs(
			columnConfigs.map((column) => (column.id === columnId ? { ...column, width } : column))
		);
	}

	function updateColumnTitle(columnId: string, title: string) {
		const nextTitle = title.trim();
		setColumnConfigs(
			columnConfigs.map((column) => {
				if (column.id !== columnId) return column;

				if (!nextTitle) {
					const nextColumn = { ...column };
					delete nextColumn.title;
					return nextColumn;
				}

				return { ...column, title: nextTitle };
			})
		);
	}

	function updateColumnIcon(columnId: string, icon: ColumnIconKey | null) {
		setColumnConfigs(
			columnConfigs.map((column) => {
				if (column.id !== columnId) return column;

				if (!icon || icon === getDefaultColumnIconKey(column)) {
					const nextColumn = { ...column };
					delete nextColumn.icon;
					return nextColumn;
				}

				return { ...column, icon };
			})
		);
	}

	function saveCustomTimelineSettings(
		columnId: string,
		filters: NostrFilter[],
		relays: RelaySelection
	) {
		setColumnConfigs(
			columnConfigs.map((column) =>
				column.id === columnId && column.type === 'timeline' && column.timelineKind === 'custom'
					? { ...column, filters, relays }
					: column
			)
		);
		openSettingsColumnId = null;
	}

	function saveFollowSettings(columnId: string, profile: ProfilePointer) {
		setColumnConfigs(
			columnConfigs.map((column) =>
				column.id === columnId &&
				column.type === 'timeline' &&
				column.timelineKind === 'preset' &&
				column.sourceKey === 'timeline_follow'
					? { ...column, pubkey: profile.pubkey, relays: profile.relays }
					: column
			)
		);
		openSettingsColumnId = null;
	}

	function saveSearchSettings(columnId: string, query: string) {
		const nextQuery = query.trim();
		if (nextQuery.length === 0) return;

		setColumnConfigs(
			columnConfigs.map((column) =>
				column.id === columnId &&
				column.type === 'timeline' &&
				column.timelineKind === 'preset' &&
				column.sourceKey === 'timeline_search'
					? { ...column, query: nextQuery }
					: column
			)
		);
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

	function toggleDefaultRelay(relay: string, isSelected: boolean) {
		selectedDefaultRelays = isSelected
			? [...selectedDefaultRelaySet, relay]
			: selectedDefaultRelays.filter((selectedRelay) => selectedRelay !== relay);
	}
</script>

<svelte:head>
	<title>{m.app_title()}</title>
</svelte:head>

<main
	class="flex h-screen min-h-0 bg-[#eef3f7] text-slate-950 dark:bg-slate-950 dark:text-slate-50"
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

			<div class="flex min-h-0 flex-1 flex-col p-4">
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
						onToggleSettings={() => toggleColumnSettings(column.id)}
						onDelete={() => deleteColumn(column.id)}
						onMoveLeft={() => moveColumn(column.id, -1)}
						onMoveRight={() => moveColumn(column.id, 1)}
						onTitleChange={(title) => updateColumnTitle(column.id, title)}
						onIconChange={(icon) => updateColumnIcon(column.id, icon)}
						onWidthChange={(width) => updateColumnWidth(column.id, width)}
						onFollowSave={(profile) => saveFollowSettings(column.id, profile)}
						onSearchSave={(query) => saveSearchSettings(column.id, query)}
						onCustomTimelineSave={(filters, relays) =>
							saveCustomTimelineSettings(column.id, filters, relays)}
						onLoadOlderTimeline={() => void loadOlderTimelineEventsFromCache(column.id)}
						onLoadNewerTimeline={() => void loadNewerTimelineEventsFromCache(column.id)}
					/>
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

<Dialog.Root bind:open={isColumnDialogOpen}>
	<Dialog.Content
		class="max-w-sm gap-0 rounded-md border border-slate-200 bg-white p-4 text-slate-950 shadow-xl ring-0 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-50"
		showCloseButton={false}
	>
		<div class="mb-4 flex items-center justify-between gap-3">
			<Dialog.Title class={['font-bold', textClass.heading]}>
				{m.add_column()}
			</Dialog.Title>
		</div>

		<label
			class={['mb-2 block font-semibold text-slate-700 dark:text-slate-300', textClass.control]}
			for="column-type"
		>
			{m.column_type()}
		</label>
		<select
			id="column-type"
			class={[
				'h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-slate-950 transition outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50 dark:focus:border-sky-400 dark:focus:ring-sky-950',
				textClass.control
			]}
			bind:value={selectedColumnType}
		>
			{#each availableColumnSourceKeys as sourceKey (sourceKey)}
				<option value={sourceKey}>{m[sourceKey]()}</option>
			{/each}
			<option value="custom_timeline">{m.column_type_custom_timeline()}</option>
			<option value="website">{m.column_type_website()}</option>
		</select>

		{#if selectedColumnType === 'timeline_follow'}
			<label
				class={[
					'mt-4 mb-2 block font-semibold text-slate-700 dark:text-slate-300',
					textClass.control
				]}
				for="follow-target"
			>
				{m.follow_target()}
			</label>
			<input
				id="follow-target"
				class={[
					'h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-slate-950 transition outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50 dark:focus:border-sky-400 dark:focus:ring-sky-950',
					textClass.control
				]}
				bind:value={followTarget}
			/>
		{/if}

		{#if selectedColumnType === 'timeline_search'}
			<label
				class={[
					'mt-4 mb-2 block font-semibold text-slate-700 dark:text-slate-300',
					textClass.control
				]}
				for="search-query"
			>
				{m.search_query()}
			</label>
			<input
				id="search-query"
				class={[
					'h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-slate-950 transition outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50 dark:focus:border-sky-400 dark:focus:ring-sky-950',
					textClass.control
				]}
				bind:value={searchQuery}
			/>
		{/if}

		{#if selectedColumnType === 'custom_timeline'}
			<div class="mt-4 mb-2 flex items-center justify-between gap-2">
				<label
					class={['block font-semibold text-slate-700 dark:text-slate-300', textClass.control]}
					for="custom-timeline-filters"
				>
					{m.custom_timeline_filters()}
				</label>
				<FilterHelpButton {textClass} />
			</div>
			<textarea
				id="custom-timeline-filters"
				class={[
					'min-h-32 w-full resize-y rounded-md border border-slate-300 bg-white px-3 py-2 font-mono text-slate-950 transition outline-none placeholder:text-slate-400 focus:border-sky-500 focus:ring-2 focus:ring-sky-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50 dark:placeholder:text-slate-500 dark:focus:border-sky-400 dark:focus:ring-sky-950',
					textClass.control
				]}
				bind:value={customTimelineFilters}
			></textarea>

			<p class={['mt-4 mb-2 font-semibold text-slate-700 dark:text-slate-300', textClass.control]}>
				{m.custom_timeline_relays()}
			</p>
			<div class="grid gap-2">
				{#each defaultRelays as relay (relay)}
					<label
						class={[
							'flex min-w-0 items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300',
							textClass.control
						]}
					>
						<input
							class="size-4 shrink-0 accent-sky-500"
							type="checkbox"
							checked={selectedDefaultRelaySet.has(relay)}
							onchange={(event) =>
								toggleDefaultRelay(relay, (event.currentTarget as HTMLInputElement).checked)}
						/>
						<span class="min-w-0 truncate">{relay}</span>
					</label>
				{/each}
			</div>

			<label
				class={[
					'mt-4 mb-2 block font-semibold text-slate-700 dark:text-slate-300',
					textClass.control
				]}
				for="custom-timeline-relays"
			>
				{m.custom_timeline_custom_relays()}
			</label>
			<textarea
				id="custom-timeline-relays"
				class={[
					'min-h-24 w-full resize-y rounded-md border border-slate-300 bg-white px-3 py-2 font-mono text-slate-950 transition outline-none placeholder:text-slate-400 focus:border-sky-500 focus:ring-2 focus:ring-sky-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50 dark:placeholder:text-slate-500 dark:focus:border-sky-400 dark:focus:ring-sky-950',
					textClass.control
				]}
				bind:value={customTimelineRelays}
			></textarea>
		{:else if selectedColumnType === 'website'}
			<label
				class={[
					'mt-4 mb-2 block font-semibold text-slate-700 dark:text-slate-300',
					textClass.control
				]}
				for="website-url"
			>
				{m.website_url()}
			</label>
			<input
				id="website-url"
				class={[
					'h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-slate-950 transition outline-none placeholder:text-slate-400 focus:border-sky-500 focus:ring-2 focus:ring-sky-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50 dark:placeholder:text-slate-500 dark:focus:border-sky-400 dark:focus:ring-sky-950',
					textClass.control
				]}
				type="url"
				placeholder="https://example.com"
				bind:value={websiteUrl}
			/>
		{/if}

		<div class="mt-5 flex justify-end gap-3">
			<div class="flex gap-2">
				<button
					type="button"
					class={[
						'h-9 rounded-md px-3 font-semibold text-slate-600 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-900',
						textClass.control
					]}
					onclick={closeColumnDialog}
				>
					{m.cancel()}
				</button>
				<button
					type="button"
					class={[
						'h-9 rounded-md bg-sky-500 px-3 font-semibold text-white transition hover:bg-sky-600 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500 dark:bg-sky-400 dark:text-slate-950 dark:hover:bg-sky-300 disabled:dark:bg-slate-800 disabled:dark:text-slate-500',
						textClass.control
					]}
					disabled={!canSaveColumn}
					onclick={saveColumnDialog}
				>
					{m.save()}
				</button>
			</div>
		</div>
	</Dialog.Content>
</Dialog.Root>
