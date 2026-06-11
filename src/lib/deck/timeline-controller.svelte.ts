import {
	clearTimelineColumn,
	hasNewerTimelineEvents,
	hasOlderTimelineEvents,
	loadEventsByIds,
	loadNewerTimelineEvents,
	loadOlderTimelineEvents,
	storeEvent,
	storeTimelineEvents
} from './timeline-cache';
import {
	emptyTimelineRuntime,
	getReferencedEventId,
	getTimelineRequest,
	getTimelineSignature,
	isFetchableTimelineColumn,
	maxVisibleTimelineEvents,
	mergeTimelineEventBatch,
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

type PendingTimelineEvent = {
	event: Nostr.Event;
	phase: TimelineEventPhase;
};

type PendingTimelineBatch = {
	timelineKey: string;
	events: PendingTimelineEvent[];
	referencedEvents: Map<string, Nostr.Event>;
	unavailableReferenceEventIds: string[];
	timeoutId: ReturnType<typeof setTimeout>;
};

const timelineEventBatchDelayMs = 16;

export function createTimelineController({ getColumnConfigs, isReady }: TimelineControllerOptions) {
	let runtimes = $state<Record<string, TimelineRuntime>>({});
	// eslint-disable-next-line svelte/prefer-svelte-reactivity -- long-lived subscription registry
	const subscriptions = new Map<string, CustomTimelineSubscription>();
	// eslint-disable-next-line svelte/prefer-svelte-reactivity -- short-lived event queues
	const pendingBatches = new Map<string, PendingTimelineBatch>();

	$effect(() => {
		if (!isReady()) return;

		const activeTimelineColumns = getColumnConfigs().filter(isFetchableTimelineColumn);
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- local lookup, not component state
		const activeTimelineColumnIds = new Set(activeTimelineColumns.map((column) => column.id));

		for (const [columnId, subscription] of subscriptions) {
			if (activeTimelineColumnIds.has(columnId)) continue;

			subscription.stop();
			subscriptions.delete(columnId);
			cancelPendingBatch(columnId);
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
			cancelPendingBatch(column.id);
			void clearTimelineColumn(column.id, signature);
			setRuntime(column.id, emptyTimelineRuntime(signature));

			const subscription = startCustomTimelineSubscription({
				filters,
				relays,
				onEvent: (event, { phase }) => addEvent(column.id, signature, event, phase),
				onReferencedEvent: (referenceEventId, event) =>
					addReferencedEvent(column.id, referenceEventId, event),
				onReferencedEventUnavailable: (referenceEventId) =>
					markReferencedEventUnavailable(column.id, referenceEventId),
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
		cancelPendingBatch(columnId);
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
		const runtime = runtimes[columnId] ?? emptyTimelineRuntime();
		if (runtime.timelineKey !== timelineKey) return;

		const pendingBatch = pendingBatches.get(columnId);
		if (pendingBatch?.timelineKey === timelineKey) {
			pendingBatch.events.push({ event, phase });
			return;
		}

		cancelPendingBatch(columnId);
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- short-lived batch lookup
		const referencedEvents = new Map<string, Nostr.Event>();
		const nextBatch: PendingTimelineBatch = {
			timelineKey,
			events: [{ event, phase }],
			referencedEvents,
			unavailableReferenceEventIds: [],
			timeoutId: setTimeout(() => flushPendingBatch(columnId), timelineEventBatchDelayMs)
		};
		pendingBatches.set(columnId, nextBatch);
	}

	function addReferencedEvent(columnId: string, referenceEventId: string, event: Nostr.Event) {
		void storeEvent(event);
		const pendingBatch = pendingBatches.get(columnId);
		if (pendingBatch?.events.some(({ event }) => event.id === referenceEventId)) {
			pendingBatch.referencedEvents.set(referenceEventId, event);
			return;
		}

		const runtime = runtimes[columnId] ?? emptyTimelineRuntime();
		if (!runtime.visibleEventIds.includes(referenceEventId)) return;

		runtimes = {
			...runtimes,
			[columnId]: {
				...runtime,
				loadedEventsById: {
					...runtime.loadedEventsById,
					[event.id]: event
				},
				unavailableReferenceEventIds: runtime.unavailableReferenceEventIds.filter(
					(eventId) => eventId !== referenceEventId
				)
			}
		};
	}

	function markReferencedEventUnavailable(columnId: string, referenceEventId: string) {
		const pendingBatch = pendingBatches.get(columnId);
		if (pendingBatch?.events.some(({ event }) => event.id === referenceEventId)) {
			if (!pendingBatch.unavailableReferenceEventIds.includes(referenceEventId)) {
				pendingBatch.unavailableReferenceEventIds.push(referenceEventId);
			}
			return;
		}

		const runtime = runtimes[columnId] ?? emptyTimelineRuntime();
		if (!runtime.visibleEventIds.includes(referenceEventId)) return;

		updateRuntime(columnId, {
			unavailableReferenceEventIds: runtime.unavailableReferenceEventIds.includes(referenceEventId)
				? runtime.unavailableReferenceEventIds
				: [...runtime.unavailableReferenceEventIds, referenceEventId]
		});
	}

	function flushPendingBatch(columnId: string) {
		const pendingBatch = pendingBatches.get(columnId);
		if (!pendingBatch) return;

		pendingBatches.delete(columnId);
		const events = deduplicatePendingEvents(pendingBatch.events);
		void storeTimelineEvents(
			columnId,
			pendingBatch.timelineKey,
			events.map(({ event }) => event)
		);

		const runtime = runtimes[columnId] ?? emptyTimelineRuntime();
		if (runtime.timelineKey !== pendingBatch.timelineKey || runtime.hasNewerStored) return;

		const runtimeWithEvents = {
			...runtime,
			loadedEventsById: {
				...runtime.loadedEventsById,
				...Object.fromEntries(events.map(({ event }) => [event.id, event]))
			},
			unavailableReferenceEventIds: [
				...runtime.unavailableReferenceEventIds,
				...pendingBatch.unavailableReferenceEventIds.filter(
					(eventId) => !runtime.unavailableReferenceEventIds.includes(eventId)
				)
			]
		};
		const nextVisibleEventIds = mergeTimelineEventBatch(
			runtimeWithEvents,
			events.flatMap(({ event, phase }) => (phase === 'initial' ? [event.id] : [])),
			events.flatMap(({ event, phase }) => (phase === 'live' ? [event.id] : []))
		);
		const trimmedVisibleEventIds = trimVisibleEventIds(nextVisibleEventIds, 'older');
		const referencedEvents = [...pendingBatch.referencedEvents.entries()].flatMap(
			([referenceEventId, event]) =>
				trimmedVisibleEventIds.includes(referenceEventId) ? [[event.id, event] as const] : []
		);

		setRuntime(
			columnId,
			pruneLoadedEvents({
				...runtimeWithEvents,
				visibleEventIds: trimmedVisibleEventIds,
				loadedEventsById: {
					...runtimeWithEvents.loadedEventsById,
					...Object.fromEntries(referencedEvents)
				},
				hasOlderStored:
					runtimeWithEvents.hasOlderStored ||
					nextVisibleEventIds.length > trimmedVisibleEventIds.length
			})
		);
		void hydrateReferencedEvents(columnId);
	}

	function deduplicatePendingEvents(events: PendingTimelineEvent[]) {
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- local lookup, not component state
		const seenEventIds = new Set<string>();
		const deduplicatedEvents: PendingTimelineEvent[] = [];

		for (let index = events.length - 1; index >= 0; index -= 1) {
			const pendingEvent = events[index];
			if (seenEventIds.has(pendingEvent.event.id)) continue;

			seenEventIds.add(pendingEvent.event.id);
			deduplicatedEvents.push(pendingEvent);
		}

		return deduplicatedEvents.reverse();
	}

	function cancelPendingBatch(columnId: string) {
		const pendingBatch = pendingBatches.get(columnId);
		if (!pendingBatch) return;

		clearTimeout(pendingBatch.timeoutId);
		pendingBatches.delete(columnId);
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
			unavailableReferenceEventIds: runtime.unavailableReferenceEventIds.filter((eventId) =>
				retainedEventIds.has(eventId)
			),
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
		for (const columnId of pendingBatches.keys()) {
			cancelPendingBatch(columnId);
		}
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
