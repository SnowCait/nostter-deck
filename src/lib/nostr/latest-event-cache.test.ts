import 'fake-indexeddb/auto';
import { afterAll, beforeEach, describe, expect, test, vi } from 'vitest';
import type * as Nostr from 'nostr-typedef';
import { resetSessionTimelineCache } from '$lib/deck/timeline-cache';
import {
	deleteCachedLatestEvents,
	deletePersistentLatestEventCacheForTests,
	getCachedLatestEvent,
	getCachedLatestEvents,
	PersistentCacheDatabase,
	putCachedLatestEvent,
	putCachedLatestEvents,
	resetPersistentLatestEventCacheForTests
} from './latest-event-cache';
import { getLatestEventKey } from './latest-event-order';

function event(patch: Partial<Nostr.Event> = {}): Nostr.Event {
	return {
		id: 'b'.repeat(64),
		pubkey: 'a'.repeat(64),
		created_at: 100,
		kind: 0,
		tags: [],
		content: '',
		sig: '0'.repeat(128),
		...patch
	};
}

beforeEach(async () => {
	await resetPersistentLatestEventCacheForTests();
});

afterAll(async () => {
	await deletePersistentLatestEventCacheForTests();
});

describe('persistent latest event schema', () => {
	test('uses the persistent database and required compound indexes', () => {
		const database = new PersistentCacheDatabase();

		expect(database.name).toBe('nostter-deck-persistent-cache');
		expect(database.latestEvents.schema.primKey.src).toBe('[pubkey+kind+identifier]');
		expect(database.latestEvents.schema.indexes.map((index) => index.src)).toContain(
			'[kind+pubkey]'
		);
		database.close();
	});
});

describe('persistent latest event writes', () => {
	test('inserts, updates, and ignores losing events', async () => {
		const initial = event({ id: '3'.repeat(64), created_at: 100 });
		const newer = event({ id: '2'.repeat(64), created_at: 200 });
		const older = event({ id: '1'.repeat(64), created_at: 50 });

		await expect(putCachedLatestEvent(initial)).resolves.toBe('inserted');
		await expect(putCachedLatestEvent(newer)).resolves.toBe('updated');
		await expect(putCachedLatestEvent(older)).resolves.toBe('ignored');
		await expect(putCachedLatestEvent(newer)).resolves.toBe('ignored');
		await expect(getCachedLatestEvent(getLatestEventKey(initial))).resolves.toEqual(newer);
	});

	test('stores the original signed event while normalizing derived key fields', async () => {
		const uppercase = event({ pubkey: 'ABCDEF'.repeat(10) + 'ABCD' });

		await putCachedLatestEvent(uppercase);

		const stored = await getCachedLatestEvent(getLatestEventKey(uppercase));
		expect(stored).toEqual(uppercase);
		expect(stored?.pubkey).toBe(uppercase.pubkey);
	});

	test('reduces duplicate input keys and writes a batch in one transaction', async () => {
		const transaction = vi.spyOn(PersistentCacheDatabase.prototype, 'transaction');
		const older = event({ id: '3'.repeat(64), created_at: 100 });
		const winner = event({ id: '2'.repeat(64), created_at: 200 });
		const differentKey = event({ id: '1'.repeat(64), kind: 3 });

		await expect(putCachedLatestEvents([older, winner, differentKey])).resolves.toEqual({
			inserted: 2,
			updated: 0,
			ignored: 1
		});
		expect(transaction).toHaveBeenCalledTimes(1);
		transaction.mockRestore();
	});

	test('rejects invalid input without changing stored records', async () => {
		const existing = event({ id: '1'.repeat(64), kind: 3 });
		await putCachedLatestEvent(existing);

		await expect(
			putCachedLatestEvents([event({ id: '2'.repeat(64) }), event({ id: '3'.repeat(64), kind: 1 })])
		).rejects.toThrow('Unsupported latest event kind: 1');

		await expect(
			getCachedLatestEvents([getLatestEventKey(existing), getLatestEventKey(event())])
		).resolves.toEqual([existing, undefined]);
	});

	test('rolls back all writes when the IndexedDB transaction fails', async () => {
		const valid = event({ id: '1'.repeat(64), kind: 0 });
		const uncloneable = event({
			id: '2'.repeat(64),
			kind: 3,
			content: (() => undefined) as unknown as string
		});

		await expect(putCachedLatestEvents([valid, uncloneable])).rejects.toThrow();
		await expect(
			getCachedLatestEvents([getLatestEventKey(valid), getLatestEventKey(uncloneable)])
		).resolves.toEqual([undefined, undefined]);
	});
});

describe('persistent latest event reads and deletion', () => {
	test('bulk retrieval preserves key order and missing entries', async () => {
		const profile = event({ id: '1'.repeat(64), kind: 0 });
		const contacts = event({ id: '2'.repeat(64), kind: 3 });
		const missing = event({ id: '3'.repeat(64), kind: 10002 });
		const addressable = event({
			id: '4'.repeat(64),
			kind: 30000,
			tags: [['d', 'favorites']]
		});
		await putCachedLatestEvents([profile, contacts, addressable]);

		await expect(
			getCachedLatestEvents([
				getLatestEventKey(contacts),
				getLatestEventKey(missing),
				getLatestEventKey(addressable),
				getLatestEventKey(profile)
			])
		).resolves.toEqual([contacts, undefined, addressable, profile]);
	});

	test('deletes records by compound key', async () => {
		const profile = event({ id: '1'.repeat(64), kind: 0 });
		const contacts = event({ id: '2'.repeat(64), kind: 3 });
		await putCachedLatestEvents([profile, contacts]);

		await deleteCachedLatestEvents([getLatestEventKey(profile)]);

		await expect(
			getCachedLatestEvents([getLatestEventKey(profile), getLatestEventKey(contacts)])
		).resolves.toEqual([undefined, contacts]);
	});

	test('survives a reset of the session timeline cache', async () => {
		const profile = event();
		await putCachedLatestEvent(profile);

		await resetSessionTimelineCache();

		await expect(getCachedLatestEvent(getLatestEventKey(profile))).resolves.toEqual(profile);
	});
});
