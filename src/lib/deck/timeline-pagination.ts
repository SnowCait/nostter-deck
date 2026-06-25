import {
	emptyTimelineRuntime,
	getReferencedEventId,
	maxVisibleTimelineEvents,
	mergeTimelineEventIds,
	timelinePageSize,
	type TimelineRuntime
} from './timeline-runtime';
import type { CachedTimelineEvent } from './timeline-cache';
import type * as Nostr from 'nostr-typedef';

export type TimelineCursor = {
	createdAt: number;
	eventId: string;
};

type TimelineCachePage = {
	entries: CachedTimelineEvent[];
	eventsById: Record<string, Nostr.Event>;
};

type TimelinePaginationOptions = {
	getRuntime: (columnId: string) => TimelineRuntime | undefined;
	setRuntime: (columnId: string, runtime: TimelineRuntime) => void;
	updateRuntime: (columnId: string, patch: Partial<TimelineRuntime>) => void;
	loadEventsByIds: (eventIds: string[]) => Promise<Record<string, Nostr.Event>>;
	loadOlderTimelineEvents: (
		columnId: string,
		timelineKey: string,
		cursor: TimelineCursor,
		limit: number
	) => Promise<TimelineCachePage>;
	loadNewerTimelineEvents: (
		columnId: string,
		timelineKey: string,
		cursor: TimelineCursor,
		limit: number
	) => Promise<TimelineCachePage>;
	hasOlderTimelineEvents: (
		columnId: string,
		timelineKey: string,
		cursor: TimelineCursor
	) => Promise<boolean>;
	hasNewerTimelineEvents: (
		columnId: string,
		timelineKey: string,
		cursor: TimelineCursor
	) => Promise<boolean>;
};

export function createTimelinePagination({
	getRuntime,
	setRuntime,
	updateRuntime,
	loadEventsByIds,
	loadOlderTimelineEvents,
	loadNewerTimelineEvents,
	hasOlderTimelineEvents,
	hasNewerTimelineEvents
}: TimelinePaginationOptions) {
	async function hydrateReferencedEvents(columnId: string) {
		const runtime = getRuntime(columnId) ?? emptyTimelineRuntime();
		const referencedEventIds = getMissingReferencedEventIds(runtime);
		if (referencedEventIds.length === 0) return;

		const referencedEventsById = await loadEventsByIds(referencedEventIds);
		const currentRuntime = getRuntime(columnId) ?? runtime;
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
		const runtime = getRuntime(columnId) ?? emptyTimelineRuntime();
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
		const currentRuntime = getRuntime(columnId) ?? runtime;
		const runtimeWithPage = await withReferencedEvents({
			...currentRuntime,
			loadedEventsById: {
				...currentRuntime.loadedEventsById,
				...page.eventsById
			}
		});
		const nextVisibleEventIds = mergeTimelineEventIds(runtimeWithPage, [
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
		const runtime = getRuntime(columnId) ?? emptyTimelineRuntime();
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
		const currentRuntime = getRuntime(columnId) ?? runtime;
		const runtimeWithPage = await withReferencedEvents({
			...currentRuntime,
			loadedEventsById: {
				...currentRuntime.loadedEventsById,
				...page.eventsById
			}
		});
		const nextVisibleEventIds = mergeTimelineEventIds(runtimeWithPage, [
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

	return {
		hydrateReferencedEvents,
		loadOlder,
		loadNewer
	};
}

export function getMissingReferencedEventIds(runtime: TimelineRuntime) {
	return runtime.visibleEventIds
		.map((eventId) => runtime.loadedEventsById[eventId])
		.flatMap((event) =>
			event ? [getReferencedEventId(event)].flatMap((id) => (id ? [id] : [])) : []
		)
		.filter((eventId) => !runtime.loadedEventsById[eventId]);
}

export function trimVisibleEventIds(eventIds: string[], trimSide: 'newer' | 'older') {
	if (eventIds.length <= maxVisibleTimelineEvents) return eventIds;

	return trimSide === 'newer'
		? eventIds.slice(eventIds.length - maxVisibleTimelineEvents)
		: eventIds.slice(0, maxVisibleTimelineEvents);
}

export function getVisibleCursor(runtime: TimelineRuntime, side: 'newer' | 'older') {
	const eventId = side === 'newer' ? runtime.visibleEventIds[0] : runtime.visibleEventIds.at(-1);
	return getEventCursor(runtime.loadedEventsById[eventId ?? '']);
}

export function getEventCursor(event?: Nostr.Event): TimelineCursor | null {
	return event ? { createdAt: event.created_at, eventId: event.id } : null;
}

export function pruneLoadedEvents(runtime: TimelineRuntime): TimelineRuntime {
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
			Object.entries(runtime.loadedEventsById).filter(([eventId]) => retainedEventIds.has(eventId))
		)
	};
}
