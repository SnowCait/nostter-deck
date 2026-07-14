import { Contacts, ShortTextNote } from 'nostr-tools/kinds';
import type * as Nostr from 'nostr-typedef';
import { describe, expect, test, vi } from 'vitest';
import {
	createMentionCandidateController,
	extractFollowPubkeys,
	selectLatestFollowList
} from './mention-candidate-controller.svelte';
import { defaultRelays } from '$lib/nostr/relays';

const accountA = 'a'.repeat(64);
const accountB = 'b'.repeat(64);
const followedA = 'c'.repeat(64);
const followedB = 'd'.repeat(64);
const cachedPubkey = 'e'.repeat(64);

function event(id: string, patch: Partial<Nostr.Event> = {}): Nostr.Event {
	return {
		id,
		pubkey: accountA,
		created_at: 100,
		kind: Contacts,
		tags: [],
		content: '',
		sig: '0'.repeat(128),
		...patch
	};
}

describe('mention candidate controller', () => {
	test('selects the newest follow list and the lexically smaller id on a timestamp tie', () => {
		const latest = selectLatestFollowList([
			event('f'.repeat(64), { created_at: 101 }),
			event('1'.repeat(64), { created_at: 101 }),
			event('0'.repeat(64), { created_at: 200, kind: ShortTextNote }),
			event('2'.repeat(64), { created_at: 100 })
		]);

		expect(latest?.id).toBe('1'.repeat(64));
	});

	test('normalizes and deduplicates valid p tags', () => {
		expect(
			extractFollowPubkeys([
				['p', followedA.toUpperCase()],
				['p', followedA],
				['p', 'broken'],
				['e', followedB]
			])
		).toEqual([followedA]);
	});

	test('combines fallback and profile relays, requests profiles, and clears on logout', async () => {
		const requestProfileMetadata = vi.fn();
		const loadFollowPubkeys = vi.fn(async () => [followedA]);
		const controller = createMentionCandidateController({
			getProfiles: () => [{ pubkey: cachedPubkey, profile: { name: 'Cached', customEmojis: [] } }],
			requestProfileMetadata,
			getAccountReadRelays: async () => [],
			loadFollowPubkeys,
			profileRelayUrls: ['wss://profiles.example/']
		});

		await controller.setAccount(accountA);

		expect(loadFollowPubkeys).toHaveBeenCalledWith(
			accountA,
			[...defaultRelays, 'wss://profiles.example/'],
			expect.any(AbortSignal)
		);
		expect(requestProfileMetadata).toHaveBeenCalledWith(
			[followedA],
			[...defaultRelays, 'wss://profiles.example/']
		);
		expect(controller.candidates).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ pubkey: followedA, isFollowing: true, hasProfile: false }),
				expect.objectContaining({ pubkey: cachedPubkey, isFollowing: false, hasProfile: true })
			])
		);

		await controller.setAccount(null);
		expect(controller.candidates).toEqual([]);
	});

	test('discards an old account result after switching accounts', async () => {
		const { promise: firstResult, resolve: resolveFirst } = Promise.withResolvers<string[]>();
		const loadFollowPubkeys = vi
			.fn()
			.mockImplementationOnce(() => firstResult)
			.mockResolvedValueOnce([followedB]);
		const requestProfileMetadata = vi.fn();
		const controller = createMentionCandidateController({
			getProfiles: () => [],
			requestProfileMetadata,
			getAccountReadRelays: async () => ['wss://read.example/'],
			loadFollowPubkeys,
			profileRelayUrls: []
		});

		const firstAccountLoad = controller.setAccount(accountA);
		await Promise.resolve();
		await controller.setAccount(accountB);
		resolveFirst([followedA]);
		await firstAccountLoad;

		expect(controller.candidates).toEqual([
			expect.objectContaining({ pubkey: followedB, isFollowing: true })
		]);
		expect(requestProfileMetadata).toHaveBeenCalledOnce();
		expect(requestProfileMetadata).toHaveBeenCalledWith([followedB], ['wss://read.example/']);
	});
});
