import 'fake-indexeddb/auto';
import { verifier } from '@rx-nostr/crypto';
import { finalizeEvent, getPublicKey } from 'nostr-tools/pure';
import { Contacts, Emojisets, RelayList, UserEmojiList } from 'nostr-tools/kinds';
import type * as Nostr from 'nostr-typedef';
import {
	createRxBackwardReq,
	createRxNostr,
	type ICloseEvent,
	type IMessageEvent,
	type IWebSocket,
	type RxNostr
} from 'rx-nostr';
import { finalize, Subject } from 'rxjs';
import { afterAll, afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { requestLatestFollowPubkeys } from '../deck/mention-candidate-controller.svelte';
import { loadUserEmojiReactionCandidates } from './emoji-reactions';
import { getNostrClient } from './client';
import { getLatestFollowList } from './follow-list';
import * as latestEventCache from './latest-event-cache';
import * as nip65 from './nip65';
import { getCachedNip65RelayTags, refreshNip65Relays } from './nip65';
import { combineRelays, defaultRelays, indexerRelays, normalizeRelay } from './relays';

const use = vi.hoisted(() => vi.fn());
vi.mock('./client', () => ({ getNostrClient: vi.fn(() => ({ use })) }));

const pubkey = 'a'.repeat(64);
const otherPubkey = 'b'.repeat(64);
const relays = ['wss://request.example/'];

function event(patch: Partial<Nostr.Event> = {}): Nostr.Event {
	return {
		id: '2'.repeat(64),
		pubkey,
		created_at: 200,
		kind: RelayList,
		tags: [],
		content: '',
		sig: '0'.repeat(128),
		...patch
	};
}

function prepareRequest() {
	const packets = new Subject<{ event: Nostr.Event }>();
	const emit = vi.fn();
	const over = vi.fn();
	use.mockImplementationOnce((request: ReturnType<typeof createRxBackwardReq>) => {
		vi.spyOn(request, 'emit').mockImplementation(emit);
		vi.spyOn(request, 'over').mockImplementation(over);
		return packets;
	});
	return { packets, emit, over };
}

function send(packets: Subject<{ event: Nostr.Event }>, events: Nostr.Event[]) {
	for (const event of events) {
		packets.next({ event });
	}
}

// Include every arrival order so both timestamp directions and both tie directions are exercised.
const orders = [
	[0, 1, 2],
	[0, 2, 1],
	[1, 0, 2],
	[1, 2, 0],
	[2, 0, 1],
	[2, 1, 0]
];

beforeEach(() => {
	vi.useFakeTimers({
		toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date']
	});
	use.mockReset();
});
afterEach(() => {
	vi.restoreAllMocks();
	vi.useRealTimers();
});

describe('replaceable event requests', () => {
	test.each(orders)('selects the NIP-65 winner in arrival order %j', async (...order) => {
		const { packets, emit, over } = prepareRequest();
		const result = refreshNip65Relays(pubkey);
		const winner = event({ tags: [['r', 'wss://winner.example/']] });
		const versions = [
			event({ id: '0'.repeat(64), created_at: 100 }),
			event({ id: '3'.repeat(64) }),
			winner
		];
		send(
			packets,
			order.map((index) => versions[index])
		);
		// Neither another author nor another kind may replace this relay list.
		send(packets, [
			event({ pubkey: otherPubkey, created_at: 300 }),
			event({ kind: UserEmojiList, created_at: 300 }),
			{ ...winner, tags: [['r', 'wss://duplicate.example/']] }
		]);
		packets.complete();

		await expect(result).resolves.toEqual(winner.tags);
		expect(getCachedNip65RelayTags(pubkey)).toEqual(winner.tags);
		expect(emit).toHaveBeenCalledExactlyOnceWith(
			{ kinds: [RelayList], authors: [pubkey], limit: 1 },
			{ relays: [...indexerRelays] }
		);
		expect(over).toHaveBeenCalledOnce();
		expect(packets.observed).toBe(false);
		expect(vi.getTimerCount()).toBe(0);
	});

	test.each(orders)('selects emoji list and set winners in arrival order %j', async (...order) => {
		const listRequest = prepareRequest();
		const firstSetRequest = prepareRequest();
		const secondSetRequest = prepareRequest();
		const result = loadUserEmojiReactionCandidates(pubkey, relays);
		const references = [`${Emojisets}:${otherPubkey}:cats`, `${Emojisets}:${pubkey}:dogs`];
		const list = event({
			kind: UserEmojiList,
			tags: [
				['emoji', 'direct', 'https://emoji.example/direct.png'],
				...references.map((address) => ['a', address, 'wss://hint.example/'])
			]
		});
		const versions = [
			{ ...list, id: '0'.repeat(64), created_at: 100, tags: [] },
			{ ...list, id: '3'.repeat(64), tags: [] },
			list
		];
		send(
			listRequest.packets,
			order.map((index) => versions[index])
		);
		listRequest.packets.complete();
		await Promise.resolve();

		// RxNostr supplies a separate filtered stream for each author/kind/identifier request.
		for (const [index, request] of [firstSetRequest, secondSetRequest].entries()) {
			const author = index === 0 ? otherPubkey : pubkey;
			const identifier = index === 0 ? 'cats' : 'dogs';
			const set = event({
				kind: Emojisets,
				pubkey: author,
				tags: [
					['d', identifier],
					['emoji', identifier, `https://emoji.example/${identifier}.png`]
				]
			});
			const versions = [
				{ ...set, id: '0'.repeat(64), created_at: 100, tags: [['d', identifier]] },
				{ ...set, id: '3'.repeat(64), tags: [['d', identifier]] },
				set
			];
			send(
				request.packets,
				order.map((version) => versions[version])
			);
			request.packets.next({ event: { ...set, tags: [['d', identifier]] } });
			request.packets.complete();
			expect(request.emit).toHaveBeenCalledExactlyOnceWith(
				{ kinds: [Emojisets], authors: [author], '#d': [identifier], limit: 1 },
				{ relays: combineRelays(['wss://hint.example/'], relays, [...defaultRelays]) }
			);
		}

		await expect(result).resolves.toEqual([
			expect.objectContaining({
				primaryShortcode: 'direct',
				categoryId: `${UserEmojiList}:${pubkey}`
			}),
			expect.objectContaining({ primaryShortcode: 'cats', address: references[0] }),
			expect.objectContaining({ primaryShortcode: 'dogs', address: references[1] })
		]);
		expect(listRequest.emit).toHaveBeenCalledExactlyOnceWith(
			{ kinds: [UserEmojiList], authors: [pubkey], limit: 1 },
			{ relays: combineRelays(relays, [...defaultRelays]) }
		);
		for (const request of [listRequest, firstSetRequest, secondSetRequest]) {
			expect(request.over).toHaveBeenCalledOnce();
			expect(request.packets.observed).toBe(false);
		}
		expect(vi.getTimerCount()).toBe(0);
	});

	test.each(orders)('selects the follow list winner in arrival order %j', async (...order) => {
		const { packets, emit, over } = prepareRequest();
		const result = requestLatestFollowPubkeys(pubkey, relays, new AbortController().signal);
		const winner = event({ kind: Contacts, tags: [['p', otherPubkey]] });
		const versions = [
			{ ...winner, id: '0'.repeat(64), created_at: 100, tags: [] },
			{ ...winner, id: '3'.repeat(64), tags: [] },
			winner
		];
		send(
			packets,
			order.map((index) => versions[index])
		);
		send(packets, [
			event({ pubkey: otherPubkey, kind: Contacts, created_at: 300 }),
			event({ kind: UserEmojiList, created_at: 300 }),
			{ ...winner, tags: [] }
		]);
		packets.complete();
		await expect(result).resolves.toEqual([otherPubkey]);
		expect(emit).toHaveBeenCalledExactlyOnceWith(
			{ kinds: [Contacts], authors: [pubkey], limit: 1 },
			{ relays }
		);
		expect(over).toHaveBeenCalledOnce();
		expect(packets.observed).toBe(false);
		expect(vi.getTimerCount()).toBe(0);
	});

	test('returns empty results when requests complete without events', async () => {
		for (const load of [
			() => refreshNip65Relays(pubkey),
			() => loadUserEmojiReactionCandidates(pubkey, relays),
			() => requestLatestFollowPubkeys(pubkey, relays, new AbortController().signal)
		]) {
			const { packets } = prepareRequest();
			const result = load();
			packets.complete();
			await expect(result).resolves.toEqual([]);
			expect(packets.observed).toBe(false);
		}
		expect(vi.getTimerCount()).toBe(0);
	});

	test('preserves timeout results and unsubscribes unfinished requests', async () => {
		const cached = prepareRequest();
		const cachedResult = refreshNip65Relays(pubkey);
		const cachedEvent = event({ tags: [['r', 'wss://cached.example/']] });
		cached.packets.next({ event: cachedEvent });
		cached.packets.complete();
		await cachedResult;

		const nip65 = prepareRequest();
		const nip65Result = refreshNip65Relays(pubkey);
		nip65.packets.next({ event: event({ tags: [['r', 'wss://unfinished.example/']] }) });
		const emoji = prepareRequest();
		const emojiResult = loadUserEmojiReactionCandidates(pubkey, relays);
		emoji.packets.next({
			event: event({
				kind: UserEmojiList,
				tags: [['emoji', 'cat', 'https://emoji.example/cat.png']]
			})
		});
		const follows = prepareRequest();
		const followResult = requestLatestFollowPubkeys(pubkey, relays, new AbortController().signal);
		follows.packets.next({ event: event({ kind: Contacts, tags: [['p', otherPubkey]] }) });
		await vi.advanceTimersByTimeAsync(5_000);

		await expect(nip65Result).resolves.toBeNull();
		expect(getCachedNip65RelayTags(pubkey)).toEqual(cachedEvent.tags);
		await expect(emojiResult).resolves.toEqual([]);
		await expect(followResult).resolves.toEqual([otherPubkey]);
		for (const request of [nip65, emoji, follows]) {
			expect(request.packets.observed).toBe(false);
		}
		expect(vi.getTimerCount()).toBe(0);
	});
});

// Exercise rx-nostr's actual REQ/EOSE, verification and completion behavior without real relays.
class FollowListRelaySocket implements IWebSocket {
	static sockets: FollowListRelaySocket[] = [];
	readyState = 0;
	sent: Nostr.ToRelayMessage.Any[] = [];
	private listeners = new Map<string, Set<(event: IMessageEvent & ICloseEvent) => void>>();

	constructor(readonly url: string) {
		FollowListRelaySocket.sockets.push(this);
	}

	addEventListener(type: string, callback: (event: IMessageEvent & ICloseEvent) => void) {
		if (!this.listeners.has(type)) {
			this.listeners.set(type, new Set());
		}
		this.listeners.get(type)!.add(callback);
	}

	removeEventListener(type: string, callback: (event: IMessageEvent & ICloseEvent) => void) {
		this.listeners.get(type)?.delete(callback);
	}

	private dispatch(type: string, data?: string, code = 1000) {
		for (const listener of [...(this.listeners.get(type) ?? [])]) {
			listener({ type, data, code, reason: '' });
		}
	}

	open() {
		this.readyState = 1;
		this.dispatch('open');
	}

	send(data: string) {
		this.sent.push(JSON.parse(data));
	}

	close(code = 1000) {
		this.readyState = 3;
		this.dispatch('close', undefined, code);
	}

	get req() {
		const req = this.sent.find((message) => message[0] === 'REQ');
		if (!req || req[0] !== 'REQ') {
			throw new Error('No REQ sent');
		}
		return req;
	}

	receive(message: Nostr.ToClientMessage.Any) {
		this.dispatch('message', JSON.stringify(message));
	}

	event(event: Nostr.Event) {
		this.receive(['EVENT', this.req[1], event]);
	}

	eose() {
		this.receive(['EOSE', this.req[1]]);
	}
}

const followSecretKey = Uint8Array.from({ length: 32 }, () => 1);
const followPubkey = getPublicKey(followSecretKey);
const secondSecretKey = Uint8Array.from({ length: 32 }, () => 2);
const secondFollowPubkey = getPublicKey(secondSecretKey);
const followWriteRelays = ['wss://first.example/', 'wss://second.example/'];

function signedFollowEvent(
	patch: Partial<Pick<Nostr.Event, 'kind' | 'created_at' | 'content' | 'tags'>> = {},
	secretKey = followSecretKey
) {
	return structuredClone(
		finalizeEvent(
			{
				kind: Contacts,
				created_at: 200,
				content: 'original content',
				tags: [
					['p', pubkey, 'wss://hint.example/', 'name'],
					['custom', 'preserved']
				],
				...patch
			},
			secretKey
		)
	);
}

describe('cached follow list requests with rx-nostr', () => {
	let client: RxNostr;
	let requestFinished = vi.fn<() => void>();

	beforeEach(async () => {
		await latestEventCache.resetPersistentLatestEventCacheForTests();
		FollowListRelaySocket.sockets = [];
		configureClient();
	});

	function configureClient(eoseTimeout = 30_000) {
		client = createRxNostr({
			websocketCtor: FollowListRelaySocket,
			verifier,
			// Keep the API's author/kind guards under test as well as signature verification.
			skipValidateFilterMatching: true,
			skipFetchNip11: true,
			disconnectTimeout: 0,
			eoseTimeout,
			retry: { strategy: 'off' }
		});
		vi.mocked(getNostrClient).mockReturnValue(client);
		client.setDefaultRelays(followWriteRelays.map((relay) => ['r', relay, 'write']));
		requestFinished = vi.fn();
	}

	afterEach(() => {
		client.dispose();
		expect(vi.getTimerCount()).toBe(0);
		vi.mocked(getNostrClient).mockImplementation(() => ({ use }) as unknown as RxNostr);
	});

	afterAll(async () => {
		await latestEventCache.deletePersistentLatestEventCacheForTests();
	});

	async function start(target = followPubkey) {
		// Cache I/O runs on the real event loop; only the network deadlines use fake timers.
		let started = false;
		const useRequest = client.use.bind(client);
		vi.spyOn(client, 'use').mockImplementation((...args) => {
			started = true;
			return useRequest(...args).pipe(finalize(requestFinished));
		});
		const result = getLatestFollowList(target);
		await vi.waitFor(() => expect(started).toBe(true));
		for (const socket of FollowListRelaySocket.sockets) {
			socket.open();
		}
		return { result, sockets: FollowListRelaySocket.sockets };
	}

	function expectCleanedUp(sockets: FollowListRelaySocket[]) {
		expect(requestFinished).toHaveBeenCalledOnce();
		for (const socket of sockets) {
			expect(socket.sent).toContainEqual(['CLOSE', socket.req[1]]);
		}
		expect(vi.getTimerCount()).toBe(0);
	}

	test('queries only configured write relays without fetching NIP-65', async () => {
		const refresh = vi.spyOn(nip65, 'refreshNip65Relays');
		client.setDefaultRelays([
			['r', 'wss://app-write.example', 'write'],
			['r', 'wss://app-read.example', 'read'],
			['r', 'wss://app-both.example']
		]);
		const { result, sockets } = await start(followPubkey);
		const queried = sockets.filter((socket) => socket.sent.some((message) => message[0] === 'REQ'));
		expect(queried.map((socket) => normalizeRelay(socket.url)).sort()).toEqual([
			'wss://app-both.example/',
			'wss://app-write.example/'
		]);
		for (const socket of queried) {
			expect(socket.req.slice(2)).toEqual([
				{ authors: [followPubkey], kinds: [Contacts], limit: 1 }
			]);
			socket.eose();
		}
		await expect(result).resolves.toBeUndefined();
		expect(refresh).not.toHaveBeenCalled();
		expect(client.use).toHaveBeenCalledExactlyOnceWith(expect.anything(), {
			on: { defaultWriteRelays: true }
		});
		expectCleanedUp(queried);
	});

	test.each(['empty', 'read-only', 'cache-only'] as const)(
		'does not fall back to other relays with %s configuration',
		async (configuration) => {
			client.setDefaultRelays(
				configuration === 'read-only' ? [['r', 'wss://app-read.example', 'read']] : []
			);
			const cached = configuration === 'cache-only' ? signedFollowEvent() : undefined;
			if (cached) {
				await latestEventCache.putCachedLatestEvent(cached);
			}
			const { result, sockets } = await start();
			await vi.advanceTimersByTimeAsync(5_000);
			await expect(result).resolves.toEqual(cached);
			expect(sockets.flatMap((socket) => socket.sent)).toEqual([]);
			expectCleanedUp([]);
		}
	);

	test.each(['eose', 'no-eose'] as const)(
		'keeps a verified full event from one relay with %s while the other times out',
		async (completion) => {
			const write = vi.spyOn(latestEventCache, 'putCachedLatestEvent');
			const { result, sockets } = await start();
			const winner = signedFollowEvent();
			sockets[0].event(winner);
			if (completion === 'eose') {
				sockets[0].eose();
			}
			await vi.advanceTimersByTimeAsync(5_000);
			await expect(result).resolves.toEqual(winner);
			expect(write).toHaveBeenCalledExactlyOnceWith(winner);
			await expect(
				latestEventCache.getCachedLatestEvent([followPubkey, Contacts, ''])
			).resolves.toEqual(winner);
			expectCleanedUp(sockets);
		}
	);

	test.each(['older', 'same', 'newer', 'winning-tie', 'losing-tie'] as const)(
		'compares a %s network candidate with the persistent cache',
		async (scenario) => {
			const ties = [
				signedFollowEvent({ content: 'one' }),
				signedFollowEvent({ content: 'two' })
			].sort((a, b) => a.id.localeCompare(b.id));
			const cached = scenario.endsWith('tie')
				? ties[scenario === 'winning-tie' ? 1 : 0]
				: signedFollowEvent();
			const candidate =
				scenario === 'same'
					? cached
					: scenario.endsWith('tie')
						? ties[scenario === 'winning-tie' ? 0 : 1]
						: signedFollowEvent({ created_at: scenario === 'newer' ? 300 : 100 });
			await latestEventCache.putCachedLatestEvent(cached);
			const write = vi.spyOn(latestEventCache, 'putCachedLatestEvent');
			const { result, sockets } = await start();
			sockets[0].event(candidate);
			for (const socket of sockets) {
				socket.eose();
			}
			const winner = scenario === 'newer' || scenario === 'winning-tie' ? candidate : cached;
			await expect(result).resolves.toEqual(winner);
			await expect(
				latestEventCache.getCachedLatestEvent([followPubkey, Contacts, ''])
			).resolves.toEqual(winner);
			expect(write).toHaveBeenCalledTimes(winner === cached ? 0 : 1);
			expectCleanedUp(sockets);
		}
	);

	test.each(['newer-event', 'older-event', 'no-event'] as const)(
		'returns the cache updated by a concurrent request when receiving %s',
		async (response) => {
			const v1 = signedFollowEvent({ created_at: 100 });
			const v2 = signedFollowEvent({ created_at: 200 });
			const v3 = signedFollowEvent({ created_at: 300 });
			await latestEventCache.putCachedLatestEvent(v1);
			const write = vi.spyOn(latestEventCache, 'putCachedLatestEvent');
			const { result: resultA, sockets } = await start();
			const requestA = sockets[0].req[1];
			const sentB = Promise.withResolvers<string>();
			const queriedByB = new Set<FollowListRelaySocket>();

			// Wait for B to send its own REQ to both relays before allowing A to finish.
			// Both calls have then read v1 and are waiting for their network responses.
			for (const socket of sockets) {
				const send = socket.send.bind(socket);
				vi.spyOn(socket, 'send').mockImplementation((data) => {
					send(data);
					const message = JSON.parse(data) as Nostr.ToRelayMessage.Any;
					if (message[0] === 'REQ' && message[1] !== requestA) {
						queriedByB.add(socket);
						if (queriedByB.size === sockets.length) {
							sentB.resolve(message[1]);
						}
					}
				});
			}
			const resultB = getLatestFollowList(followPubkey);
			const requestB = await sentB.promise;
			sockets[0].receive(['EVENT', requestA, v3]);
			for (const socket of sockets) {
				socket.receive(['EOSE', requestA]);
			}
			await expect(resultA).resolves.toEqual(v3);
			await expect(write.mock.results[0].value).resolves.toBe('updated');

			if (response !== 'no-event') {
				sockets[0].receive(['EVENT', requestB, response === 'newer-event' ? v2 : v1]);
			}
			for (const socket of sockets) {
				socket.receive(['EOSE', requestB]);
			}
			await expect(resultB).resolves.toEqual(v3);
			if (response === 'newer-event') {
				expect(write).toHaveBeenNthCalledWith(2, v2);
				await expect(write.mock.results[1].value).resolves.toBe('ignored');
			} else {
				expect(write).toHaveBeenCalledOnce();
			}
			await expect(
				latestEventCache.getCachedLatestEvent([followPubkey, Contacts, ''])
			).resolves.toEqual(v3);
			expect(requestFinished).toHaveBeenCalledTimes(2);
			for (const socket of sockets) {
				expect(socket.sent).toContainEqual(['CLOSE', requestA]);
				expect(socket.sent).toContainEqual(['CLOSE', requestB]);
			}
			expect(vi.getTimerCount()).toBe(0);
		}
	);

	test.each([false, true])(
		'selects across relays in reverse arrival order: %s',
		async (reverse) => {
			const { result, sockets } = await start();
			const older = signedFollowEvent({ created_at: 100 });
			const ties = [
				signedFollowEvent({ content: 'one' }),
				signedFollowEvent({ content: 'two' })
			].sort((a, b) => a.id.localeCompare(b.id));
			const versions = [older, ties[1], ties[0]];
			for (const [index, event] of (reverse ? versions.toReversed() : versions).entries()) {
				sockets[index % 2].event(event);
			}
			for (const socket of sockets) {
				socket.eose();
			}
			await expect(result).resolves.toEqual(ties[0]);
			expectCleanedUp(sockets);
		}
	);

	test('ignores mismatched authors/kinds and events with invalid signatures', async () => {
		const write = vi.spyOn(latestEventCache, 'putCachedLatestEvent');
		const { result, sockets } = await start();
		sockets[0].event(signedFollowEvent({}, secondSecretKey));
		sockets[0].event(signedFollowEvent({ kind: 1 }));
		sockets[0].event({ ...signedFollowEvent(), sig: '0'.repeat(128) });
		for (const socket of sockets) {
			socket.eose();
		}
		await expect(result).resolves.toBeUndefined();
		expect(write).not.toHaveBeenCalled();
		expectCleanedUp(sockets);
	});

	test.each(['deadline', 'internal-timeout', 'disconnect', 'closed'] as const)(
		'returns undefined after %s without events',
		async (failure) => {
			const write = vi.spyOn(latestEventCache, 'putCachedLatestEvent');
			if (failure === 'internal-timeout') {
				client.dispose();
				configureClient(1_000);
			}
			const { result, sockets } = await start();
			if (failure === 'internal-timeout') {
				await vi.advanceTimersByTimeAsync(1_000);
			} else if (failure === 'disconnect') {
				for (const socket of sockets) {
					socket.close(4000);
				}
			} else if (failure === 'closed') {
				for (const socket of sockets) {
					socket.receive(['CLOSED', socket.req[1], 'error: unavailable']);
				}
			} else {
				await vi.advanceTimersByTimeAsync(5_000);
			}
			await expect(result).resolves.toBeUndefined();
			expect(write).not.toHaveBeenCalled();
			// A disconnected/CLOSED relay may no longer accept CLOSE; the subscription and timer still go away.
			expect(requestFinished).toHaveBeenCalledOnce();
			expect(vi.getTimerCount()).toBe(0);
		}
	);

	test('returns cache when all relays are silent and keeps accounts separate', async () => {
		const cached = signedFollowEvent();
		const other = signedFollowEvent({}, secondSecretKey);
		await latestEventCache.putCachedLatestEvent(cached);
		await latestEventCache.putCachedLatestEvent(other);
		const write = vi.spyOn(latestEventCache, 'putCachedLatestEvent');
		const { result, sockets } = await start(secondFollowPubkey);
		await vi.advanceTimersByTimeAsync(5_000);
		await expect(result).resolves.toEqual(other);
		await expect(
			latestEventCache.getCachedLatestEvent([followPubkey, Contacts, ''])
		).resolves.toEqual(cached);
		expect(write).not.toHaveBeenCalled();
		expectCleanedUp(sockets);
	});

	test('propagates cache read failures before sending a REQ', async () => {
		const error = new Error('IndexedDB unavailable');
		vi.spyOn(latestEventCache, 'getCachedLatestEvent').mockRejectedValue(error);
		await expect(getLatestFollowList(followPubkey)).rejects.toBe(error);
		expect(FollowListRelaySocket.sockets).toHaveLength(0);
	});

	test('propagates cache write failures after cleaning up the request', async () => {
		const error = new Error('IndexedDB write failed');
		vi.spyOn(latestEventCache, 'putCachedLatestEvent').mockRejectedValue(error);
		const { result, sockets } = await start();
		const rejected = expect(result).rejects.toBe(error);
		sockets[0].event(signedFollowEvent());
		for (const socket of sockets) {
			socket.eose();
		}
		await rejected;
		expectCleanedUp(sockets);
	});

	test('propagates final cache read failures after cleaning up the request', async () => {
		const error = new Error('IndexedDB reread failed');
		const read = vi.spyOn(latestEventCache, 'getCachedLatestEvent');
		const { result, sockets } = await start();
		read.mockRejectedValueOnce(error);
		const rejected = expect(result).rejects.toBe(error);
		for (const socket of sockets) {
			socket.eose();
		}
		await rejected;
		expect(read).toHaveBeenCalledTimes(2);
		expectCleanedUp(sockets);
	});
});
