import Dexie, { type Table } from 'dexie';
import type * as Nostr from 'nostr-typedef';
import { isNewerLatestEvent, reduceLatestEvents, type LatestEventKey } from './latest-event-order';

export type { LatestEventKey } from './latest-event-order';

export type CachedLatestEvent = {
	pubkey: string;
	kind: number;
	identifier: string;
	event: Nostr.Event;
};

export type PutCachedLatestEventStatus = 'inserted' | 'updated' | 'ignored';

export type PutCachedLatestEventsResult = {
	inserted: number;
	updated: number;
	ignored: number;
};

export class PersistentCacheDatabase extends Dexie {
	latestEvents!: Table<CachedLatestEvent, LatestEventKey>;

	constructor() {
		super('nostter-deck-persistent-cache');

		this.version(1).stores({
			latestEvents: '[pubkey+kind+identifier], [kind+pubkey]'
		});
	}
}

const persistentCacheDb = new PersistentCacheDatabase();

export async function putCachedLatestEvent(
	event: Nostr.Event
): Promise<PutCachedLatestEventStatus> {
	const result = await putCachedLatestEvents([event]);

	if (result.inserted === 1) {
		return 'inserted';
	}
	if (result.updated === 1) {
		return 'updated';
	}
	return 'ignored';
}

export async function putCachedLatestEvents(
	events: Nostr.Event[]
): Promise<PutCachedLatestEventsResult> {
	if (events.length === 0) {
		return { inserted: 0, updated: 0, ignored: 0 };
	}

	return persistentCacheDb.transaction('rw', persistentCacheDb.latestEvents, async () => {
		const candidates = reduceLatestEvents(events);
		const result: PutCachedLatestEventsResult = {
			inserted: 0,
			updated: 0,
			ignored: events.length - candidates.length
		};
		const existingRecords = await persistentCacheDb.latestEvents.bulkGet(
			candidates.map((candidate) => candidate.key)
		);
		const acceptedRecords: CachedLatestEvent[] = [];

		for (const [index, candidate] of candidates.entries()) {
			const current = existingRecords[index];
			if (current && !isNewerLatestEvent(candidate.event, current.event)) {
				result.ignored += 1;
				continue;
			}

			acceptedRecords.push({
				pubkey: candidate.pubkey,
				kind: candidate.kind,
				identifier: candidate.identifier,
				event: candidate.event
			});
			if (current) {
				result.updated += 1;
			} else {
				result.inserted += 1;
			}
		}

		if (acceptedRecords.length > 0) {
			await persistentCacheDb.latestEvents.bulkPut(acceptedRecords);
		}

		return result;
	});
}

export async function getCachedLatestEvent(key: LatestEventKey) {
	return (await persistentCacheDb.latestEvents.get(key))?.event;
}

export async function getCachedLatestEvents(keys: LatestEventKey[]) {
	const records = await persistentCacheDb.latestEvents.bulkGet(keys);
	return records.map((record) => record?.event);
}

export async function deleteCachedLatestEvents(keys: LatestEventKey[]) {
	await persistentCacheDb.latestEvents.bulkDelete(keys);
}

export async function deletePersistentLatestEventCacheForTests() {
	await persistentCacheDb.delete();
}

export async function resetPersistentLatestEventCacheForTests() {
	await persistentCacheDb.delete();
	await persistentCacheDb.open();
}
