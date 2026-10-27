import type * as Nostr from 'nostr-typedef';
import { sessionCacheDb } from '$lib/platform/session-cache-database';

export type CachedEvent = {
	eventId: string;
	kind: number;
	pubkey: string;
	createdAt: number;
	storedAt: number;
	event: Nostr.Event;
};

const cachedEvents = sessionCacheDb.table<CachedEvent, string>('events');

export async function storeEvent(event: Nostr.Event) {
	await cachedEvents.put(toCachedEvent(event));
}

export async function storeEvents(events: Nostr.Event[]) {
	await cachedEvents.bulkPut(events.map(toCachedEvent));
}

export async function loadEventsByIds(eventIds: string[]) {
	const events = await cachedEvents.bulkGet(eventIds);

	return Object.fromEntries(
		events.flatMap((cachedEvent) => (cachedEvent ? [[cachedEvent.eventId, cachedEvent.event]] : []))
	);
}

export async function loadEventById(eventId: string) {
	return (await cachedEvents.get(eventId))?.event;
}

function toCachedEvent(event: Nostr.Event): CachedEvent {
	return {
		eventId: event.id,
		kind: event.kind,
		pubkey: event.pubkey,
		createdAt: event.created_at,
		storedAt: Date.now(),
		event
	};
}
