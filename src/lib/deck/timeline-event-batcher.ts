import {
	emptyTimelineRuntime,
	mergeTimelineEventBatch,
	type TimelineRuntime
} from './timeline-runtime';
import { pruneLoadedEvents, trimVisibleEventIds } from './timeline-pagination';
import type { TimelineEventPhase } from '$lib/nostr/timeline';
import type * as Nostr from 'nostr-typedef';

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

type TimelineEventBatcherOptions = {
	getRuntime: (columnId: string) => TimelineRuntime | undefined;
	setRuntime: (columnId: string, runtime: TimelineRuntime) => void;
	updateRuntime: (columnId: string, patch: Partial<TimelineRuntime>) => void;
	storeEvent: (event: Nostr.Event) => Promise<void>;
	storeTimelineEvents: (
		columnId: string,
		timelineKey: string,
		events: Nostr.Event[]
	) => Promise<void>;
	hydrateReferencedEvents: (columnId: string) => Promise<void>;
	batchDelayMs?: number;
};

export const timelineEventBatchDelayMs = 16;

export function createTimelineEventBatcher({
	getRuntime,
	setRuntime,
	updateRuntime,
	storeEvent,
	storeTimelineEvents,
	hydrateReferencedEvents,
	batchDelayMs = timelineEventBatchDelayMs
}: TimelineEventBatcherOptions) {
	const pendingBatches = new Map<string, PendingTimelineBatch>();

	function addEvent(
		columnId: string,
		timelineKey: string,
		event: Nostr.Event,
		phase: TimelineEventPhase
	) {
		const runtime = getRuntime(columnId) ?? emptyTimelineRuntime();
		if (runtime.timelineKey !== timelineKey) return;

		const pendingBatch = pendingBatches.get(columnId);
		if (pendingBatch?.timelineKey === timelineKey) {
			pendingBatch.events.push({ event, phase });
			return;
		}

		cancelPendingBatch(columnId);
		const referencedEvents = new Map<string, Nostr.Event>();
		const nextBatch: PendingTimelineBatch = {
			timelineKey,
			events: [{ event, phase }],
			referencedEvents,
			unavailableReferenceEventIds: [],
			timeoutId: setTimeout(() => flushPendingBatch(columnId), batchDelayMs)
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

		const runtime = getRuntime(columnId) ?? emptyTimelineRuntime();
		if (!runtime.visibleEventIds.includes(referenceEventId)) return;

		setRuntime(columnId, {
			...runtime,
			loadedEventsById: {
				...runtime.loadedEventsById,
				[event.id]: event
			},
			unavailableReferenceEventIds: runtime.unavailableReferenceEventIds.filter(
				(eventId) => eventId !== referenceEventId
			)
		});
	}

	function markReferencedEventUnavailable(columnId: string, referenceEventId: string) {
		const pendingBatch = pendingBatches.get(columnId);
		if (pendingBatch?.events.some(({ event }) => event.id === referenceEventId)) {
			if (!pendingBatch.unavailableReferenceEventIds.includes(referenceEventId)) {
				pendingBatch.unavailableReferenceEventIds.push(referenceEventId);
			}
			return;
		}

		const runtime = getRuntime(columnId) ?? emptyTimelineRuntime();
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

		const runtime = getRuntime(columnId) ?? emptyTimelineRuntime();
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

	function cancelPendingBatch(columnId: string) {
		const pendingBatch = pendingBatches.get(columnId);
		if (!pendingBatch) return;

		clearTimeout(pendingBatch.timeoutId);
		pendingBatches.delete(columnId);
	}

	function stop() {
		for (const columnId of pendingBatches.keys()) {
			cancelPendingBatch(columnId);
		}
	}

	return {
		addEvent,
		addReferencedEvent,
		markReferencedEventUnavailable,
		cancelPendingBatch,
		flushPendingBatch,
		stop
	};
}

export function deduplicatePendingEvents(events: PendingTimelineEvent[]) {
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
