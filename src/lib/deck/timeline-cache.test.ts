import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import type * as Nostr from 'nostr-typedef';
import { afterAll, afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { sessionCacheDb } from '$lib/platform/session-cache-database';
import { loadEventById, loadEventsByIds, storeEvent, storeEvents } from '$lib/nostr/event-cache';
import {
	clearTimelineColumn,
	hasNewerTimelineEvents,
	hasOlderTimelineEvents,
	loadLatestTimelineEvents,
	loadNewerTimelineEvents,
	loadOlderTimelineEvents,
	resetSessionTimelineCache,
	storeTimelineEvent,
	storeTimelineEvents
} from './timeline-cache';

function event(id: string, created_at = 100): Nostr.Event {
	return {
		id,
		created_at,
		pubkey: 'a'.repeat(64),
		kind: 1,
		tags: [],
		content: id,
		sig: '0'.repeat(128)
	};
}

beforeEach(async () => {
	// fake-indexeddb treats repeated array references as cyclic keys. Dexie.maxKey is
	// reused in compound bounds, so give the test adapter equivalent independent arrays.
	const bound = IDBKeyRange.bound.bind(IDBKeyRange);
	const copyKey = (key: unknown): unknown => (Array.isArray(key) ? key.map(copyKey) : key);
	vi.spyOn(IDBKeyRange, 'bound').mockImplementation((lower, upper, lowerOpen, upperOpen) =>
		bound(copyKey(lower), copyKey(upper), lowerOpen, upperOpen)
	);
	await resetSessionTimelineCache();
});
afterEach(() => vi.restoreAllMocks());
afterAll(() => sessionCacheDb.close());

describe('shared session event and Deck timeline cache', () => {
	test('opens existing version 1 data without changing its schema or records', async () => {
		sessionCacheDb.close();
		const legacy = new Dexie('nostter-deck-session');
		legacy.version(1).stores({
			events: '&eventId, kind, pubkey, createdAt, [kind+pubkey]',
			timelineEvents:
				'&timelineEventKey, columnId, [columnId+timelineKey+sortCreatedAt+eventId], [columnId+timelineKey+eventId]'
		});
		const source = event('legacy');
		const record = {
			eventId: source.id,
			kind: 1,
			pubkey: source.pubkey,
			createdAt: 100,
			storedAt: 123,
			event: source
		};
		await legacy.table('events').put(record);
		await legacy.table('timelineEvents').put({
			timelineEventKey: 'column:key:legacy',
			columnId: 'column',
			timelineKey: 'key',
			eventId: source.id,
			createdAt: 100,
			sortCreatedAt: -100
		});
		legacy.close();

		await sessionCacheDb.open();
		expect(sessionCacheDb.verno).toBe(1);
		expect(await sessionCacheDb.table('events').get(source.id)).toEqual(record);
		expect(await loadEventById(source.id)).toEqual(source);
		expect((await loadLatestTimelineEvents('column', 'key', 10)).eventsById).toEqual({
			legacy: source
		});
		expect(sessionCacheDb.table('events').schema.indexes.map((index) => index.src)).toEqual([
			'kind',
			'pubkey',
			'createdAt',
			'[kind+pubkey]'
		]);
		expect(sessionCacheDb.table('timelineEvents').schema.indexes.map((index) => index.src)).toEqual(
			['columnId', '[columnId+timelineKey+sortCreatedAt+eventId]', '[columnId+timelineKey+eventId]']
		);
	});

	test('stores and retrieves shared events without creating column indexes', async () => {
		const first = event('first');
		const second = event('second');
		await storeEvent(first);
		await storeEvents([second]);
		expect(await loadEventById('first')).toEqual(first);
		expect(await loadEventById('missing')).toBeUndefined();
		expect(await loadEventsByIds(['second', 'missing', 'first'])).toEqual({ first, second });
		expect(await sessionCacheDb.table('timelineEvents').count()).toBe(0);
	});

	test('preserves paging order and exclusive cursor boundaries including timestamp ties', async () => {
		const events = [event('a', 300), event('b', 200), event('c', 200), event('d', 100)];
		await storeTimelineEvents('column', 'key', [...events].reverse());
		const latest = await loadLatestTimelineEvents('column', 'key', 2);
		expect(latest.entries.map((entry) => entry.eventId)).toEqual(['a', 'b']);
		expect(latest.eventsById).toEqual({ a: events[0], b: events[1] });
		const cursor = { createdAt: 200, eventId: 'b' };
		expect(
			(await loadOlderTimelineEvents('column', 'key', cursor, 2)).entries.map(
				(entry) => entry.eventId
			)
		).toEqual(['c', 'd']);
		expect(
			(
				await loadNewerTimelineEvents('column', 'key', { createdAt: 100, eventId: 'd' }, 2)
			).entries.map((entry) => entry.eventId)
		).toEqual(['b', 'c']);
		expect(await hasOlderTimelineEvents('column', 'key', cursor)).toBe(true);
		expect(await hasNewerTimelineEvents('column', 'key', cursor)).toBe(true);
		expect(await hasOlderTimelineEvents('column', 'key', { createdAt: 100, eventId: 'd' })).toBe(
			false
		);
		expect(await hasNewerTimelineEvents('column', 'key', { createdAt: 300, eventId: 'a' })).toBe(
			false
		);
	});

	test('deletes only selected column indexes and preserves shared event bodies', async () => {
		const source = event('shared');
		await storeTimelineEvent('one', 'old', source);
		await storeTimelineEvent('one', 'keep', source);
		await storeTimelineEvent('two', 'old', source);
		await clearTimelineColumn('one', 'keep');
		expect((await loadLatestTimelineEvents('one', 'old', 10)).entries).toEqual([]);
		expect((await loadLatestTimelineEvents('one', 'keep', 10)).entries).toHaveLength(1);
		await clearTimelineColumn('one');
		expect((await loadLatestTimelineEvents('one', 'keep', 10)).entries).toEqual([]);
		expect((await loadLatestTimelineEvents('two', 'old', 10)).entries).toHaveLength(1);
		expect(await loadEventById(source.id)).toEqual(source);
	});

	test('rolls back event inserts and replacements if the column index write fails', async () => {
		const original = event('existing');
		await storeTimelineEvent('column', 'key', original);
		vi.spyOn(sessionCacheDb.table('timelineEvents'), 'bulkPut').mockRejectedValueOnce(
			new Error('index write failed')
		);
		await expect(
			storeTimelineEvents('column', 'key', [{ ...original, content: 'replacement' }, event('new')])
		).rejects.toThrow('index write failed');
		expect(await loadEventById('existing')).toEqual(original);
		expect(await loadEventById('new')).toBeUndefined();
		expect((await loadLatestTimelineEvents('column', 'key', 10)).entries).toHaveLength(1);
	});

	test('resets shared events and every column index together', async () => {
		await storeEvent(event('standalone'));
		await storeTimelineEvent('one', 'key', event('indexed'));
		await resetSessionTimelineCache();
		expect(await loadEventsByIds(['standalone', 'indexed'])).toEqual({});
		expect(await sessionCacheDb.table('timelineEvents').count()).toBe(0);
	});
});
