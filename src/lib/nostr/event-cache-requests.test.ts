import 'fake-indexeddb/auto';
import type * as Nostr from 'nostr-typedef';
import { Subject } from 'rxjs';
import { afterAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { sessionCacheDb } from '$lib/platform/session-cache-database';
import { loadEventById, storeEvent } from './event-cache';
import { getNostrQuoteState, requestNostrQuote } from './quotes.svelte';
import { startThreadSubscription } from './thread';

const use = vi.hoisted(() => vi.fn());
vi.mock('./client', () => ({ getNostrClient: () => ({ use }) }));
vi.mock('./profiles', () => ({ requestProfiles: vi.fn() }));

function event(id: string): Nostr.Event {
	return {
		id,
		created_at: 100,
		pubkey: 'a'.repeat(64),
		kind: 1,
		tags: [],
		content: id,
		sig: '0'.repeat(128)
	};
}

beforeEach(async () => {
	use.mockReset();
	await sessionCacheDb.table('events').clear();
});
afterAll(() => sessionCacheDb.close());

describe('thread and quote event caching', () => {
	test('loads a quote from the common cache without a relay request', async () => {
		const source = event('cached-quote');
		await storeEvent(source);
		const release = requestNostrQuote(source.id, []);
		try {
			await vi.waitFor(() =>
				expect(getNostrQuoteState(source.id)).toEqual({ status: 'loaded', event: source })
			);
			expect(use).not.toHaveBeenCalled();
		} finally {
			release();
		}
	});

	test('stores a relay quote in the same common cache', async () => {
		const source = event('relay-quote');
		const packets = new Subject<{ event: Nostr.Event }>();
		use.mockReturnValue(packets);
		const release = requestNostrQuote(source.id, []);
		try {
			await vi.waitFor(() => expect(use).toHaveBeenCalledOnce());
			packets.next({ event: source });
			await vi.waitFor(async () => expect(await loadEventById(source.id)).toEqual(source));
			expect(getNostrQuoteState(source.id)).toEqual({ status: 'loaded', event: source });
		} finally {
			release();
		}
	});

	test('stores fetched thread events where quote retrieval can reuse them', async () => {
		const source = event('thread-root');
		const packets = new Subject<{ event: Nostr.Event }>();
		use.mockReturnValue(packets);
		const onEvents = vi.fn();
		const subscription = startThreadSubscription({
			selectedEvent: source,
			relays: [],
			onEvents,
			onLoadingChange: vi.fn(),
			onError: vi.fn()
		});
		packets.next({ event: source });
		packets.complete();
		await vi.waitFor(async () => expect(await loadEventById(source.id)).toEqual(source));
		expect(onEvents).toHaveBeenCalledWith([source]);
		const release = requestNostrQuote(source.id, []);
		try {
			await vi.waitFor(() =>
				expect(getNostrQuoteState(source.id)).toEqual({ status: 'loaded', event: source })
			);
			expect(use).toHaveBeenCalledOnce();
		} finally {
			release();
			subscription.stop();
		}
	});
});
