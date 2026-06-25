import { describe, expect, test, vi } from 'vitest';
import { Repost, ShortTextNote } from 'nostr-tools/kinds';
import type * as Nostr from 'nostr-typedef';
import type { CachedTimelineEvent } from './timeline-cache';
import {
	createTimelinePagination,
	getVisibleCursor,
	pruneLoadedEvents,
	trimVisibleEventIds
} from './timeline-pagination';
import {
	emptyTimelineRuntime,
	maxVisibleTimelineEvents,
	type TimelineRuntime
} from './timeline-runtime';

function event(
	id: string,
	createdAt: number,
	options: Partial<Pick<Nostr.Event, 'kind' | 'tags'>> = {}
): Nostr.Event {
	return {
		id,
		pubkey: 'a'.repeat(64),
		created_at: createdAt,
		kind: options.kind ?? ShortTextNote,
		tags: options.tags ?? [],
		content: id,
		sig: '0'.repeat(128)
	};
}

function cachedEntry(
	columnId: string,
	timelineKey: string,
	sourceEvent: Nostr.Event
): CachedTimelineEvent {
	return {
		timelineEventKey: `${columnId}:${timelineKey}:${sourceEvent.id}`,
		columnId,
		timelineKey,
		eventId: sourceEvent.id,
		createdAt: sourceEvent.created_at,
		sortCreatedAt: -sourceEvent.created_at
	};
}

function createRuntimeStore(initial: TimelineRuntime) {
	let runtime = initial;

	return {
		getRuntime: () => runtime,
		setRuntime: (_columnId: string, nextRuntime: TimelineRuntime) => {
			runtime = nextRuntime;
		},
		updateRuntime: (_columnId: string, patch: Partial<TimelineRuntime>) => {
			runtime = { ...runtime, ...patch };
		},
		read: () => runtime
	};
}

describe('timeline pagination', () => {
	test('loads older events from the tail cursor and updates stored flags', async () => {
		const newest = event('1'.repeat(64), 300);
		const middle = event('2'.repeat(64), 200);
		const older = event('3'.repeat(64), 100);
		const store = createRuntimeStore({
			...emptyTimelineRuntime('timeline'),
			visibleEventIds: [newest.id, middle.id],
			loadedEventsById: {
				[newest.id]: newest,
				[middle.id]: middle
			},
			hasOlderStored: true
		});
		const loadOlderTimelineEvents = vi.fn(async () => ({
			entries: [cachedEntry('column', 'timeline', older)],
			eventsById: { [older.id]: older }
		}));
		const pagination = createTimelinePagination({
			getRuntime: store.getRuntime,
			setRuntime: store.setRuntime,
			updateRuntime: store.updateRuntime,
			loadEventsByIds: vi.fn(async () => ({})),
			loadOlderTimelineEvents,
			loadNewerTimelineEvents: vi.fn(async () => ({ entries: [], eventsById: {} })),
			hasOlderTimelineEvents: vi.fn(async () => false),
			hasNewerTimelineEvents: vi.fn(async () => false)
		});

		await pagination.loadOlder('column');

		expect(loadOlderTimelineEvents).toHaveBeenCalledWith(
			'column',
			'timeline',
			{ createdAt: middle.created_at, eventId: middle.id },
			100
		);
		expect(store.read()).toMatchObject({
			visibleEventIds: [newest.id, middle.id, older.id],
			hasOlderStored: false,
			isLoadingOlder: false
		});
	});

	test('loads newer events from the head cursor and updates stored flags', async () => {
		const newer = event('4'.repeat(64), 400);
		const current = event('5'.repeat(64), 300);
		const store = createRuntimeStore({
			...emptyTimelineRuntime('timeline'),
			visibleEventIds: [current.id],
			loadedEventsById: {
				[current.id]: current
			},
			hasNewerStored: true
		});
		const loadNewerTimelineEvents = vi.fn(async () => ({
			entries: [cachedEntry('column', 'timeline', newer)],
			eventsById: { [newer.id]: newer }
		}));
		const pagination = createTimelinePagination({
			getRuntime: store.getRuntime,
			setRuntime: store.setRuntime,
			updateRuntime: store.updateRuntime,
			loadEventsByIds: vi.fn(async () => ({})),
			loadOlderTimelineEvents: vi.fn(async () => ({ entries: [], eventsById: {} })),
			loadNewerTimelineEvents,
			hasOlderTimelineEvents: vi.fn(async () => false),
			hasNewerTimelineEvents: vi.fn(async () => false)
		});

		await pagination.loadNewer('column');

		expect(loadNewerTimelineEvents).toHaveBeenCalledWith(
			'column',
			'timeline',
			{ createdAt: current.created_at, eventId: current.id },
			100
		);
		expect(store.read()).toMatchObject({
			visibleEventIds: [newer.id, current.id],
			hasNewerStored: false,
			isLoadingNewer: false
		});
	});

	test('hydrates missing referenced events for visible references', async () => {
		const referencedEventId = '8'.repeat(64);
		const repost = event('6'.repeat(64), 200, {
			kind: Repost,
			tags: [['e', referencedEventId]]
		});
		const referenced = event(referencedEventId, 100);
		const store = createRuntimeStore({
			...emptyTimelineRuntime('timeline'),
			visibleEventIds: [repost.id],
			loadedEventsById: {
				[repost.id]: repost
			}
		});
		const loadEventsByIds = vi.fn(async () => ({ [referenced.id]: referenced }));
		const pagination = createTimelinePagination({
			getRuntime: store.getRuntime,
			setRuntime: store.setRuntime,
			updateRuntime: store.updateRuntime,
			loadEventsByIds,
			loadOlderTimelineEvents: vi.fn(async () => ({ entries: [], eventsById: {} })),
			loadNewerTimelineEvents: vi.fn(async () => ({ entries: [], eventsById: {} })),
			hasOlderTimelineEvents: vi.fn(async () => false),
			hasNewerTimelineEvents: vi.fn(async () => false)
		});

		await pagination.hydrateReferencedEvents('column');

		expect(loadEventsByIds).toHaveBeenCalledWith([referencedEventId]);
		expect(store.read().loadedEventsById[referenced.id]).toEqual(referenced);
	});

	test('calculates cursors, trims visible ids, and prunes unreferenced loaded events', () => {
		const retained = event('7'.repeat(64), 200);
		const stale = event('9'.repeat(64), 100);
		const ids = Array.from({ length: maxVisibleTimelineEvents + 1 }, (_, index) => `${index}`);
		const runtime = {
			...emptyTimelineRuntime('timeline'),
			visibleEventIds: [retained.id],
			liveEventIds: [retained.id, stale.id],
			unavailableReferenceEventIds: [retained.id, stale.id],
			loadedEventsById: {
				[retained.id]: retained,
				[stale.id]: stale
			}
		};

		expect(getVisibleCursor(runtime, 'newer')).toEqual({
			createdAt: retained.created_at,
			eventId: retained.id
		});
		expect(trimVisibleEventIds(ids, 'newer')).toEqual(ids.slice(1));
		expect(trimVisibleEventIds(ids, 'older')).toEqual(ids.slice(0, maxVisibleTimelineEvents));
		expect(pruneLoadedEvents(runtime)).toMatchObject({
			liveEventIds: [retained.id],
			unavailableReferenceEventIds: [retained.id],
			loadedEventsById: { [retained.id]: retained }
		});
	});
});
