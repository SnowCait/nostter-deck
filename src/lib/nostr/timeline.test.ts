import 'fake-indexeddb/auto';
import { Contacts, Followsets, ShortTextNote } from 'nostr-tools/kinds';
import type * as Nostr from 'nostr-typedef';
import type { createRxBackwardReq, LazyFilter } from 'rx-nostr';
import { EMPTY, Observable, Subject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { NostrFilter } from './filters';
import * as cache from './latest-event-cache';
import { profileRelays } from './relays';
import { startCustomTimelineSubscription } from './timeline';

const { use } = vi.hoisted(() => ({ use: vi.fn() }));
vi.mock('./client', () => ({
	getNostrClient: () => ({ use, createAllErrorObservable: () => EMPTY })
}));
vi.mock('./profiles', () => ({ requestProfiles: vi.fn() }));

const owner = 'a'.repeat(64);
const first = 'b'.repeat(64);
const second = 'c'.repeat(64);
const third = 'd'.repeat(64);
const relay = 'wss://timeline.example/';
const listKey = [owner, Followsets, 'favorites'] as const;
const followingFilter = { authors: `${Contacts}:${owner}:`, kinds: [ShortTextNote], limit: 20 };
const listFilter = {
	authors: `${Followsets}:${owner}:favorites`,
	kinds: [ShortTextNote],
	limit: 15
};

type RelayRequest = {
	strategy: string;
	filters: LazyFilter[];
	relays: string[] | undefined;
	packets: Subject<{ event: Nostr.Event }>;
	closed: boolean;
};

const requests: RelayRequest[] = [];
let stop: (() => void) | undefined;

function event(id: string, patch: Partial<Nostr.Event>): Nostr.Event {
	return {
		id: id.repeat(64),
		pubkey: owner,
		created_at: 100,
		kind: Contacts,
		tags: [],
		content: '',
		sig: '0'.repeat(128),
		...patch
	};
}

function followList(id: string, authors: string[], createdAt = 100) {
	return event(id, { created_at: createdAt, tags: authors.map((author) => ['p', author]) });
}

function addressableList(id: string, authors: string[], createdAt = 100) {
	return event(id, {
		kind: Followsets,
		created_at: createdAt,
		tags: [['d', 'favorites'], ...authors.map((author) => ['p', author])]
	});
}

function start(filters: NostrFilter[]) {
	const onEvent = vi.fn();
	const onLoadingChange = vi.fn();
	const subscription = startCustomTimelineSubscription({
		filters,
		relays: { type: 'custom', urls: [relay] },
		onEvent,
		onLoadingChange,
		onReferencedEvent: vi.fn(),
		onReferencedEventUnavailable: vi.fn(),
		onError: vi.fn()
	});
	stop = subscription.stop;
	return { ...subscription, onEvent, onLoadingChange };
}

function postRequests() {
	return requests.filter(({ filters }) =>
		filters.some(({ kinds }) => kinds?.includes(ShortTextNote))
	);
}

function answer(request: RelayRequest, ...events: Nostr.Event[]) {
	for (const event of events) {
		request.packets.next({ event });
	}
	request.packets.complete();
}

beforeEach(async () => {
	await cache.resetPersistentLatestEventCacheForTests();
	requests.length = 0;
	use.mockImplementation(
		(request: ReturnType<typeof createRxBackwardReq>, scope?: { on: { relays: string[] } }) =>
			new Observable<{ event: Nostr.Event }>((subscriber) => {
				const packets = new Subject<{ event: Nostr.Event }>();
				const response = packets.subscribe(subscriber);
				const emitted = request.getReqPacketObservable().subscribe(({ filters, relays }) => {
					const sent = {
						strategy: request.strategy,
						filters,
						relays: relays ?? scope?.on.relays,
						packets,
						closed: false
					};
					requests.push(sent);
					response.add(() => {
						sent.closed = true;
					});
				});
				return () => {
					emitted.unsubscribe();
					response.unsubscribe();
				};
			})
	);
});

afterEach(async () => {
	stop?.();
	stop = undefined;
	vi.restoreAllMocks();
	await cache.deletePersistentLatestEventCacheForTests();
});

describe('timeline author sources', () => {
	test('opens a cached Following Timeline before the relay responds and updates both post phases', async () => {
		await cache.putCachedLatestEvent(followList('1', [first]));
		const { onEvent, onLoadingChange } = start([followingFilter]);
		const source = requests[0];
		expect(source.filters).toEqual([{ kinds: [Contacts], authors: [owner], limit: 1 }]);
		expect(source.relays).toEqual([relay, ...profileRelays]);

		await vi.waitFor(() => expect(postRequests()).toHaveLength(2));
		const [oldInitial, oldLive] = postRequests();
		expect(source.closed).toBe(false);
		expect(oldInitial.filters).toEqual([
			{ kinds: [ShortTextNote], authors: [first, owner], limit: 20, until: expect.any(Number) }
		]);
		const earlierPost = event('4', { kind: ShortTextNote, pubkey: first });
		answer(oldInitial, earlierPost);

		answer(source, followList('2', [second], 101));
		await vi.waitFor(() => expect(postRequests()).toHaveLength(4));
		expect(oldLive.closed).toBe(true);
		const [, , nextInitial, nextLive] = postRequests();
		const boundary = oldInitial.filters[0].until;
		expect(nextInitial.filters).toEqual([
			{ kinds: [ShortTextNote], authors: [second, owner], limit: 20, until: boundary }
		]);
		expect(nextLive.filters).toEqual([
			{ kinds: [ShortTextNote], authors: [second, owner], since: boundary }
		]);
		const fetchedPost = event('5', { kind: ShortTextNote, pubkey: second });
		const livePost = event('6', { kind: ShortTextNote, pubkey: second });
		answer(nextInitial, fetchedPost);
		nextLive.packets.next({ event: livePost });
		expect(onEvent.mock.calls).toEqual([
			[earlierPost, { phase: 'initial' }],
			[fetchedPost, { phase: 'initial' }],
			[livePost, { phase: 'live' }]
		]);
		expect(onLoadingChange.mock.calls).toEqual([[true], [false]]);
		expect(requests.filter(({ filters }) => filters[0].kinds?.includes(Contacts))).toEqual([
			source
		]);
	});

	test('persists an uncached addressable source under its full address', async () => {
		start([listFilter]);
		const source = requests[0];
		expect(source.filters).toEqual([
			{ authors: [owner], kinds: [Followsets], '#d': ['favorites'], limit: 1 }
		]);
		expect(source.relays).toEqual([relay]);
		expect(postRequests()).toHaveLength(0);

		const matching = addressableList('1', [first]);
		const otherList = event('2', {
			kind: Followsets,
			created_at: 101,
			tags: [
				['d', 'other'],
				['p', second]
			]
		});
		answer(source, matching, otherList);
		await vi.waitFor(() => expect(postRequests()).toHaveLength(2));
		expect(postRequests().every(({ filters }) => filters[0].authors?.[0] === first)).toBe(true);
		await expect(cache.getCachedLatestEvent([...listKey])).resolves.toEqual(matching);
	});

	test.each([
		['older', followList('0', [third], 99), false],
		['duplicate', followList('1', [first, second]), false],
		['equivalent', followList('2', [second, first.toUpperCase(), second], 101), true]
	] as const)(
		'keeps the subscription when the relay returns an %s event',
		async (_, network, newer) => {
			const cached = followList('1', [first, second]);
			await cache.putCachedLatestEvent(cached);
			const read = vi.spyOn(cache, 'getCachedLatestEvent');
			start([followingFilter]);
			await vi.waitFor(() => expect(postRequests()).toHaveLength(2));
			const [, live] = postRequests();

			answer(requests[0], network);
			await vi.waitFor(() => expect(read).toHaveBeenCalledTimes(2));
			await expect(read.mock.results[1].value).resolves.toEqual(newer ? network : cached);
			expect(postRequests()).toHaveLength(2);
			expect(live.closed).toBe(false);
		}
	);

	test('uses the event saved by a concurrent writer when it supersedes the relay result', async () => {
		await cache.putCachedLatestEvent(followList('1', [first]));
		start([followingFilter]);
		await vi.waitFor(() => expect(postRequests()).toHaveLength(2));

		await cache.putCachedLatestEvent(followList('3', [third], 102));
		answer(requests[0], followList('2', [second], 101));
		await vi.waitFor(() => expect(postRequests()).toHaveLength(4));
		expect(
			postRequests()
				.slice(2)
				.map(({ filters }) => filters[0].authors)
		).toEqual([
			[third, owner],
			[third, owner]
		]);
	});

	test('keeps the cached live subscription when the refresh fails and initial posts are empty', async () => {
		await cache.putCachedLatestEvent(addressableList('1', [first]));
		const { onEvent, onLoadingChange } = start([listFilter]);
		await vi.waitFor(() => expect(postRequests()).toHaveLength(2));
		const [initial, live] = postRequests();
		answer(initial);
		expect(onLoadingChange.mock.calls).toEqual([[true], [false]]);

		requests[0].packets.error(new Error('Relay unavailable'));
		const post = event('4', { kind: ShortTextNote, pubkey: first });
		live.packets.next({ event: post });
		expect(onEvent).toHaveBeenCalledExactlyOnceWith(post, { phase: 'live' });
		expect(live.closed).toBe(false);
	});

	test('stops only the affected filters when an addressable source becomes empty', async () => {
		await cache.putCachedLatestEvent(followList('1', [first]));
		await cache.putCachedLatestEvent(addressableList('2', [second]));
		start([
			{ kinds: [ShortTextNote], authors: [third] },
			followingFilter,
			listFilter,
			{ ...listFilter, '#t': ['favorites'] }
		]);
		await vi.waitFor(() => expect(postRequests()).toHaveLength(6));
		const listRequests = postRequests().filter(({ filters }) =>
			filters[0].authors?.includes(second)
		);
		const otherRequests = postRequests().filter((request) => !listRequests.includes(request));
		expect(listRequests.map(({ filters }) => filters.length)).toEqual([2, 2]);
		const listSource = requests.find(({ filters }) => filters[0].kinds?.includes(Followsets))!;

		answer(listSource, addressableList('3', [], 101));
		await vi.waitFor(() => expect(listRequests.every(({ closed }) => closed)).toBe(true));
		expect(postRequests()).toHaveLength(6);
		expect(otherRequests.every(({ closed }) => !closed)).toBe(true);
	});

	test('ends loading when an uncached author source returns no event', async () => {
		const { onLoadingChange } = start([listFilter]);
		answer(requests[0]);
		await vi.waitFor(() => expect(onLoadingChange.mock.calls).toEqual([[true], [false]]));
		expect(postRequests()).toHaveLength(0);
	});

	test('uses the relay event even when cache reads and writes fail', async () => {
		vi.spyOn(cache, 'getCachedLatestEvent').mockRejectedValue(new Error('Read failed'));
		vi.spyOn(cache, 'putCachedLatestEvent').mockRejectedValue(new Error('Write failed'));
		start([listFilter]);
		answer(requests[0], addressableList('3', [third]));

		await vi.waitFor(() => expect(postRequests()).toHaveLength(2));
		expect(postRequests().map(({ filters }) => filters[0].authors)).toEqual([[third], [third]]);
	});

	test('ignores pending cache and relay results after stopping', async () => {
		const pendingRead = Promise.withResolvers<Nostr.Event<typeof Contacts>>();
		vi.spyOn(cache, 'getCachedLatestEvent').mockReturnValueOnce(pendingRead.promise);
		const { stop, onEvent, onLoadingChange } = start([followingFilter]);
		answer(requests[0], followList('2', [second], 101));
		stop();
		pendingRead.resolve(followList('1', [first]) as Nostr.Event<typeof Contacts>);
		await pendingRead.promise;
		await Promise.resolve();
		expect(postRequests()).toHaveLength(0);
		expect(onEvent).not.toHaveBeenCalled();
		expect(onLoadingChange.mock.calls).toEqual([[true]]);
	});
});
