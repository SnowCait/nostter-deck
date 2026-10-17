import { Contacts, Emojisets, RelayList, UserEmojiList } from 'nostr-tools/kinds';
import type * as Nostr from 'nostr-typedef';
import { createRxBackwardReq } from 'rx-nostr';
import { Subject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { requestLatestFollowPubkeys } from '../deck/mention-candidate-controller.svelte';
import { loadUserEmojiReactionCandidates } from './emoji-reactions';
import { getCachedNip65RelayTags, refreshNip65Relays } from './nip65';
import { combineRelays, defaultRelays, indexerRelays } from './relays';

const use = vi.hoisted(() => vi.fn());
vi.mock('./client', () => ({ getNostrClient: () => ({ use }) }));

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
	vi.useFakeTimers();
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
