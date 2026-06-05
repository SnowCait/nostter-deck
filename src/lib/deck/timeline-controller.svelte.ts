import {
	clearTimelineColumn,
	hasNewerTimelineEvents,
	hasOlderTimelineEvents,
	loadEventsByIds,
	loadNewerTimelineEvents,
	loadOlderTimelineEvents,
	storeEvent,
	storeTimelineEvent
} from './timeline-cache';
import {
	emptyTimelineRuntime,
	getReferencedEventId,
	getTimelineRequest,
	getTimelineSignature,
	isFetchableTimelineColumn,
	maxVisibleTimelineEvents,
	mergeTimelineEventIds,
	timelinePageSize,
	type TimelineRuntime
} from './timeline-runtime';
import type { ColumnConfig } from './types';
import { startCustomTimelineSubscription, type TimelineEventPhase } from '$lib/nostr/timeline';
import type * as Nostr from 'nostr-typedef';

type CustomTimelineSubscription = {
	signature: string;
	stop: () => void;
};

type TimelineControllerOptions = {
	getColumnConfigs: () => ColumnConfig[];
	isReady: () => boolean;
};

type TimelineCursor = {
	createdAt: number;
	eventId: string;
};

export function createTimelineController({ getColumnConfigs, isReady }: TimelineControllerOptions) {
	let runtimes = $state<Record<string, TimelineRuntime>>({});
	// eslint-disable-next-line svelte/prefer-svelte-reactivity -- long-lived subscription registry
	const subscriptions = new Map<string, CustomTimelineSubscription>();

	$effect(() => {
		if (!isReady()) return;

		const activeTimelineColumns = getColumnConfigs().filter(isFetchableTimelineColumn);
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- local lookup, not component state
		const activeTimelineColumnIds = new Set(activeTimelineColumns.map((column) => column.id));

		for (const [columnId, subscription] of subscriptions) {
			if (activeTimelineColumnIds.has(columnId)) continue;

			subscription.stop();
			subscriptions.delete(columnId);
			removeRuntime(columnId);
		}

		for (const column of activeTimelineColumns) {
			const request = getTimelineRequest(column);
			if (!request) continue;

			const filters = $state.snapshot(request.filters);
			const relays = $state.snapshot(request.relays);
			const signature = getTimelineSignature({ filters, relays });
			if (subscriptions.get(column.id)?.signature === signature) continue;

			subscriptions.get(column.id)?.stop();
			void clearTimelineColumn(column.id, signature);
			setRuntime(column.id, emptyTimelineRuntime(signature));

			const subscription = startCustomTimelineSubscription({
				filters,
				relays,
				onEvent: (event, { phase }) => addEvent(column.id, signature, event, phase),
				onReferencedEvent: (referenceEventId, event) =>
					addReferencedEvent(column.id, referenceEventId, event),
				onLoadingChange: (isLoading) => updateRuntime(column.id, { isLoading }),
				onError: (error) => updateRuntime(column.id, { error })
			});

			subscriptions.set(column.id, {
				signature,
				stop: subscription.stop
			});
		}
	});

	function setRuntime(columnId: string, runtime: TimelineRuntime) {
		runtimes = {
			...runtimes,
			[columnId]: runtime
		};
	}

	function updateRuntime(columnId: string, patch: Partial<TimelineRuntime>) {
		runtimes = {
			...runtimes,
			[columnId]: {
				...(runtimes[columnId] ?? emptyTimelineRuntime()),
				...patch
			}
		};
	}

	function removeRuntime(columnId: string) {
		const nextRuntimes = { ...runtimes };
		delete nextRuntimes[columnId];
		runtimes = nextRuntimes;
		void clearTimelineColumn(columnId);
	}

	function addEvent(
		columnId: string,
		timelineKey: string,
		event: Nostr.Event,
		phase: TimelineEventPhase
	) {
		void storeTimelineEvent(columnId, timelineKey, event);
		const runtime = runtimes[columnId] ?? emptyTimelineRuntime();
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

		setRuntime(
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

	function addReferencedEvent(columnId: string, referenceEventId: string, event: Nostr.Event) {
		void storeEvent(event);
		const runtime = runtimes[columnId] ?? emptyTimelineRuntime();
		if (!runtime.visibleEventIds.includes(referenceEventId)) return;

		runtimes = {
			...runtimes,
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
		const runtime = runtimes[columnId] ?? emptyTimelineRuntime();
		const referencedEventIds = getMissingReferencedEventIds(runtime);
		if (referencedEventIds.length === 0) return;

		const referencedEventsById = await loadEventsByIds(referencedEventIds);
		const currentRuntime = runtimes[columnId] ?? runtime;
		setRuntime(
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

	async function loadOlder(columnId: string) {
		const runtime = runtimes[columnId] ?? emptyTimelineRuntime();
		if (runtime.isLoadingOlder || !runtime.hasOlderStored) return;

		const cursor = getVisibleCursor(runtime, 'older');
		if (!cursor) return;

		updateRuntime(columnId, { isLoadingOlder: true });
		const page = await loadOlderTimelineEvents(
			columnId,
			runtime.timelineKey,
			cursor,
			timelinePageSize
		);
		const currentRuntime = runtimes[columnId] ?? runtime;
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

		setRuntime(
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

	async function loadNewer(columnId: string) {
		const runtime = runtimes[columnId] ?? emptyTimelineRuntime();
		if (runtime.isLoadingNewer || !runtime.hasNewerStored) return;

		const cursor = getVisibleCursor(runtime, 'newer');
		if (!cursor) return;

		updateRuntime(columnId, { isLoadingNewer: true });
		const page = await loadNewerTimelineEvents(
			columnId,
			runtime.timelineKey,
			cursor,
			timelinePageSize
		);
		const currentRuntime = runtimes[columnId] ?? runtime;
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

		setRuntime(
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
				event ? [getReferencedEventId(event)].flatMap((id) => (id ? [id] : [])) : []
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

	function getEventCursor(event?: Nostr.Event): TimelineCursor | null {
		return event ? { createdAt: event.created_at, eventId: event.id } : null;
	}

	function pruneLoadedEvents(runtime: TimelineRuntime): TimelineRuntime {
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- local lookup, not component state
		const retainedEventIds = new Set(runtime.visibleEventIds);
		for (const eventId of runtime.visibleEventIds) {
			const referencedEventId = getReferencedEventId(runtime.loadedEventsById[eventId]);
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

	function stop() {
		for (const subscription of subscriptions.values()) {
			subscription.stop();
		}
		subscriptions.clear();
	}

	return {
		get runtimes() {
			return runtimes;
		},
		loadOlder,
		loadNewer,
		stop
	};
}
