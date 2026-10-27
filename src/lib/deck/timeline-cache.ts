import Dexie from 'dexie';
import { sessionCacheDb } from '$lib/platform/session-cache-database';
import { loadEventsByIds, storeEvents } from '$lib/nostr/event-cache';
import type * as Nostr from 'nostr-typedef';
import type { TimelineRequest } from './timeline-runtime';

export type CachedTimelineEvent = {
	timelineEventKey: string;
	columnId: string;
	timelineKey: string;
	eventId: string;
	createdAt: number;
	sortCreatedAt: number;
};

type TimelineCursor = {
	createdAt: number;
	eventId: string;
};

const cachedTimelineEvents = sessionCacheDb.table<CachedTimelineEvent, string>('timelineEvents');

export function getTimelineKey(request: TimelineRequest) {
	return hashString(stableStringify(request));
}

export async function resetSessionTimelineCache() {
	await sessionCacheDb.transaction(
		'rw',
		sessionCacheDb.table('events'),
		cachedTimelineEvents,
		async () => {
			await sessionCacheDb.table('events').clear();
			await cachedTimelineEvents.clear();
		}
	);
}

export async function clearTimelineColumn(columnId: string, keepTimelineKey?: string) {
	const timelineEvents = cachedTimelineEvents.where('columnId').equals(columnId);
	if (!keepTimelineKey) {
		await timelineEvents.delete();
		return;
	}

	await timelineEvents.filter((entry) => entry.timelineKey !== keepTimelineKey).delete();
}

export async function storeTimelineEvent(
	columnId: string,
	timelineKey: string,
	event: Nostr.Event
) {
	await storeTimelineEvents(columnId, timelineKey, [event]);
}

export async function storeTimelineEvents(
	columnId: string,
	timelineKey: string,
	events: Nostr.Event[]
) {
	if (events.length === 0) {
		return;
	}

	await sessionCacheDb.transaction(
		'rw',
		sessionCacheDb.table('events'),
		cachedTimelineEvents,
		async () => {
			await storeEvents(events);
			await cachedTimelineEvents.bulkPut(
				events.map((event) => toCachedTimelineEvent(columnId, timelineKey, event))
			);
		}
	);
}

export async function loadLatestTimelineEvents(
	columnId: string,
	timelineKey: string,
	limit: number
) {
	const entries = await getTimelineRange(columnId, timelineKey).limit(limit).toArray();

	return entriesToEvents(entries);
}

export async function loadOlderTimelineEvents(
	columnId: string,
	timelineKey: string,
	cursor: TimelineCursor,
	limit: number
) {
	const entries = await cachedTimelineEvents
		.where('[columnId+timelineKey+sortCreatedAt+eventId]')
		.between(
			[columnId, timelineKey, -cursor.createdAt, cursor.eventId],
			[columnId, timelineKey, Dexie.maxKey, Dexie.maxKey],
			false,
			true
		)
		.limit(limit)
		.toArray();

	return entriesToEvents(entries);
}

export async function loadNewerTimelineEvents(
	columnId: string,
	timelineKey: string,
	cursor: TimelineCursor,
	limit: number
) {
	const entries = await cachedTimelineEvents
		.where('[columnId+timelineKey+sortCreatedAt+eventId]')
		.between(
			[columnId, timelineKey, Dexie.minKey, Dexie.minKey],
			[columnId, timelineKey, -cursor.createdAt, cursor.eventId],
			true,
			false
		)
		.reverse()
		.limit(limit)
		.toArray();

	return entriesToEvents(entries.reverse());
}

export async function hasOlderTimelineEvents(
	columnId: string,
	timelineKey: string,
	cursor: TimelineCursor
) {
	const count = await cachedTimelineEvents
		.where('[columnId+timelineKey+sortCreatedAt+eventId]')
		.between(
			[columnId, timelineKey, -cursor.createdAt, cursor.eventId],
			[columnId, timelineKey, Dexie.maxKey, Dexie.maxKey],
			false,
			true
		)
		.limit(1)
		.count();

	return count > 0;
}

export async function hasNewerTimelineEvents(
	columnId: string,
	timelineKey: string,
	cursor: TimelineCursor
) {
	const count = await cachedTimelineEvents
		.where('[columnId+timelineKey+sortCreatedAt+eventId]')
		.between(
			[columnId, timelineKey, Dexie.minKey, Dexie.minKey],
			[columnId, timelineKey, -cursor.createdAt, cursor.eventId],
			true,
			false
		)
		.limit(1)
		.count();

	return count > 0;
}

function getTimelineRange(columnId: string, timelineKey: string) {
	return cachedTimelineEvents
		.where('[columnId+timelineKey+sortCreatedAt+eventId]')
		.between(
			[columnId, timelineKey, Dexie.minKey, Dexie.minKey],
			[columnId, timelineKey, Dexie.maxKey, Dexie.maxKey]
		);
}

async function entriesToEvents(entries: CachedTimelineEvent[]) {
	return {
		entries,
		eventsById: await loadEventsByIds(entries.map((entry) => entry.eventId))
	};
}

function toCachedTimelineEvent(
	columnId: string,
	timelineKey: string,
	event: Nostr.Event
): CachedTimelineEvent {
	return {
		timelineEventKey: `${columnId}:${timelineKey}:${event.id}`,
		columnId,
		timelineKey,
		eventId: event.id,
		createdAt: event.created_at,
		sortCreatedAt: -event.created_at
	};
}

function stableStringify(value: unknown): string {
	if (value === null || typeof value !== 'object') {
		return JSON.stringify(value);
	}
	if (Array.isArray(value)) {
		return `[${value.map((item) => stableStringify(item)).join(',')}]`;
	}

	const entries = Object.entries(value).sort(([left], [right]) => left.localeCompare(right));
	return `{${entries
		.map(([key, entryValue]) => `${JSON.stringify(key)}:${stableStringify(entryValue)}`)
		.join(',')}}`;
}

function hashString(value: string) {
	let hash = 0x811c9dc5;
	for (const character of value) {
		hash ^= character.charCodeAt(0);
		hash = Math.imul(hash, 0x01000193);
	}

	return (hash >>> 0).toString(16).padStart(8, '0');
}
