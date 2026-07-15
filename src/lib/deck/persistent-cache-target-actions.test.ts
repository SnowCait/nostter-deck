import { describe, expect, test } from 'vitest';
import type * as Nostr from 'nostr-typedef';
import type { AccountRecord } from '$lib/nostr/accounts';
import type { LatestEventKey } from '$lib/nostr/latest-event-order';
import type { ColumnDeck } from './column-decks';
import {
	collectPersistentCacheSeedTargets,
	expandPersistentCacheTargets,
	persistentMetadataKinds,
	type PersistentCacheSeedTargets
} from './persistent-cache-target-actions';

const pubkeyA = 'a'.repeat(64);
const pubkeyB = 'b'.repeat(64);
const pubkeyC = 'c'.repeat(64);
const pubkeyD = 'd'.repeat(64);
const pubkeyE = 'e'.repeat(64);
const pubkeyF = 'f'.repeat(64);

function nip07Account(pubkey: string, id = `nip07:${pubkey}`): AccountRecord {
	return { id, method: 'nip07', pubkey, createdAt: 1 };
}

function nip46Account(pubkey: string): AccountRecord {
	return {
		id: `nip46:${pubkey}`,
		method: 'nip46',
		pubkey,
		createdAt: 2,
		bunker: { pubkey: pubkeyF, relays: ['wss://relay.example'], secret: null },
		clientSecretKey: '1'.repeat(64)
	};
}

function event(pubkey: string, kind: number, tags: Nostr.Event['tags'] = []): Nostr.Event {
	return {
		id: '1'.repeat(64),
		pubkey,
		created_at: 100,
		kind,
		tags,
		content: '',
		sig: '0'.repeat(128)
	};
}

function deck(id: string, columns: ColumnDeck['columns']): ColumnDeck {
	return { id, name: id, columns };
}

describe('persistent cache seed targets', () => {
	test('includes and normalizes every saved account while deduplicating signing methods', () => {
		const seed = collectPersistentCacheSeedTargets(
			[
				nip07Account(pubkeyB.toUpperCase()),
				nip07Account(pubkeyA),
				nip46Account(pubkeyB),
				nip07Account('invalid')
			],
			[]
		);

		expect(seed).toEqual({
			directPubkeys: [pubkeyA, pubkeyB],
			pTagExpansionSourceKeys: [
				[pubkeyA, 3, ''],
				[pubkeyB, 3, '']
			]
		});
	});

	test('scans all decks for direct authors, author sources, and NIP-65 selections', () => {
		const seed = collectPersistentCacheSeedTargets(
			[],
			[
				deck('active', [
					{
						id: 'direct-authors',
						type: 'timeline',
						timelineKind: 'custom',
						filters: [
							{ authors: [pubkeyC.toUpperCase(), 'invalid', pubkeyA], '#p': [pubkeyF] },
							{ kinds: [1] }
						],
						relays: { type: 'nip65', pubkey: pubkeyC.toUpperCase() },
						width: 'standard'
					}
				]),
				deck('inactive', [
					{
						id: 'follow',
						type: 'timeline',
						timelineKind: 'preset',
						sourceKey: 'timeline_follow',
						pubkey: pubkeyB.toUpperCase(),
						relays: { type: 'nip65', pubkey: pubkeyD.toUpperCase() },
						width: 'standard'
					},
					{
						id: 'addressable',
						type: 'timeline',
						timelineKind: 'custom',
						filters: [
							{ authors: `30000:${pubkeyE.toUpperCase()}:people` },
							{ authors: `1:${pubkeyF}:` }
						],
						relays: { type: 'default' },
						width: 'wide'
					},
					{
						id: 'website',
						type: 'website',
						url: 'https://example.com/',
						width: 'wide'
					}
				])
			]
		);

		expect(seed).toEqual({
			directPubkeys: [pubkeyA, pubkeyB, pubkeyC, pubkeyD, pubkeyE],
			pTagExpansionSourceKeys: [
				[pubkeyB, 3, ''],
				[pubkeyE, 30000, 'people']
			]
		});
		expect(seed.directPubkeys).not.toContain(pubkeyF);
	});

	test('deduplicates author sources referenced by multiple columns', () => {
		const column: ColumnDeck['columns'][number] = {
			id: 'source-1',
			type: 'timeline',
			timelineKind: 'custom',
			filters: [{ authors: `3:${pubkeyA}:` }],
			relays: { type: 'default' },
			width: 'standard'
		};
		const duplicateColumn = { ...column, id: 'source-2' };

		expect(collectPersistentCacheSeedTargets([], [deck('one', [column, duplicateColumn])])).toEqual(
			{
				directPubkeys: [pubkeyA],
				pTagExpansionSourceKeys: [[pubkeyA, 3, '']]
			}
		);
	});

	test('returns the same sorted seed regardless of account, deck, column, and filter order', () => {
		const directAuthorsColumn: ColumnDeck['columns'][number] = {
			id: 'direct',
			type: 'timeline',
			timelineKind: 'custom',
			filters: [{ authors: [pubkeyD, pubkeyC] }, { authors: [pubkeyB] }],
			relays: { type: 'default' },
			width: 'standard'
		};
		const sourceColumn: ColumnDeck['columns'][number] = {
			id: 'source',
			type: 'timeline',
			timelineKind: 'custom',
			filters: [{ authors: `30001:${pubkeyA}:z` }, { authors: `30000:${pubkeyA}:a` }],
			relays: { type: 'default' },
			width: 'standard'
		};
		const first = collectPersistentCacheSeedTargets(
			[nip07Account(pubkeyB), nip07Account(pubkeyA)],
			[deck('direct', [directAuthorsColumn]), deck('source', [sourceColumn])]
		);
		const second = collectPersistentCacheSeedTargets(
			[nip07Account(pubkeyA), nip07Account(pubkeyB)],
			[
				deck('source', [{ ...sourceColumn, filters: [...sourceColumn.filters].reverse() }]),
				deck('direct', [
					{ ...directAuthorsColumn, filters: [...directAuthorsColumn.filters].reverse() }
				])
			]
		);

		expect(first).toEqual(second);
		expect(first.directPubkeys).toEqual([pubkeyA, pubkeyB, pubkeyC, pubkeyD]);
		expect(first.pTagExpansionSourceKeys).toEqual([
			[pubkeyA, 3, ''],
			[pubkeyA, 30000, 'a'],
			[pubkeyA, 30001, 'z'],
			[pubkeyB, 3, '']
		]);
	});

	test('uses one metadata-kind policy for every resulting pubkey target', () => {
		expect(persistentMetadataKinds).toEqual([0, 3, 10002]);
	});
});

describe('persistent cache target expansion', () => {
	test('adds only valid p tags from resolved sources without recursive follow expansion', () => {
		const seed = collectPersistentCacheSeedTargets([nip07Account(pubkeyA)], []);
		const plan = expandPersistentCacheTargets(seed, [
			event(pubkeyA.toUpperCase(), 3, [
				['p', pubkeyC],
				['p', pubkeyB.toUpperCase()],
				['p', pubkeyB],
				['p', 'short'],
				['e', pubkeyD],
				['p']
			])
		]);

		expect(plan).toEqual({
			pubkeys: [pubkeyA, pubkeyB, pubkeyC],
			pTagExpansionSourceKeys: [[pubkeyA, 3, '']],
			unresolvedPTagExpansionSourceKeys: []
		});
		expect(plan.pTagExpansionSourceKeys).not.toContainEqual([pubkeyB, 3, '']);
	});

	test('distinguishes missing source events from resolved empty sources', () => {
		const seed: PersistentCacheSeedTargets = {
			directPubkeys: [pubkeyB, pubkeyA],
			pTagExpansionSourceKeys: [
				[pubkeyB, 3, ''],
				[pubkeyA, 3, '']
			]
		};

		expect(expandPersistentCacheTargets(seed, [undefined, event(pubkeyA, 3)])).toEqual({
			pubkeys: [pubkeyA, pubkeyB],
			pTagExpansionSourceKeys: [
				[pubkeyA, 3, ''],
				[pubkeyB, 3, '']
			],
			unresolvedPTagExpansionSourceKeys: [[pubkeyB, 3, '']]
		});
	});

	test('expands an addressable source event after validating its identifier', () => {
		const key: LatestEventKey = [pubkeyA, 30000, 'friends'];
		const seed = { directPubkeys: [pubkeyA], pTagExpansionSourceKeys: [key] };
		const source = event(pubkeyA, 30000, [
			['d', 'friends'],
			['p', pubkeyD]
		]);

		expect(expandPersistentCacheTargets(seed, [source]).pubkeys).toEqual([pubkeyA, pubkeyD]);
	});

	test('rejects source arrays with the wrong length', () => {
		const seed = collectPersistentCacheSeedTargets([nip07Account(pubkeyA)], []);

		expect(() => expandPersistentCacheTargets(seed, [])).toThrow(
			'Expected 1 source events, received 0'
		);
	});

	test('rejects a defined event that does not match its expected source key', () => {
		const seed: PersistentCacheSeedTargets = {
			directPubkeys: [pubkeyA],
			pTagExpansionSourceKeys: [[pubkeyA, 3, '']]
		};

		expect(() => expandPersistentCacheTargets(seed, [event(pubkeyB, 3)])).toThrow(
			'does not match its expansion source key'
		);
		expect(() => expandPersistentCacheTargets(seed, [event(pubkeyA, 0)])).toThrow(
			'does not match its expansion source key'
		);
	});

	test('returns deterministic sorted output regardless of input and tag order', () => {
		const firstSeed: PersistentCacheSeedTargets = {
			directPubkeys: [pubkeyC, pubkeyA, pubkeyC],
			pTagExpansionSourceKeys: [
				[pubkeyB, 3, ''],
				[pubkeyA, 30000, 'z']
			]
		};
		const secondSeed: PersistentCacheSeedTargets = {
			directPubkeys: [pubkeyA, pubkeyC],
			pTagExpansionSourceKeys: [
				[pubkeyA, 30000, 'z'],
				[pubkeyB, 3, '']
			]
		};
		const firstPlan = expandPersistentCacheTargets(firstSeed, [
			undefined,
			event(pubkeyA, 30000, [
				['d', 'z'],
				['p', pubkeyF],
				['p', pubkeyD]
			])
		]);
		const secondPlan = expandPersistentCacheTargets(secondSeed, [
			event(pubkeyA, 30000, [
				['d', 'z'],
				['p', pubkeyD],
				['p', pubkeyF]
			]),
			undefined
		]);

		expect(firstPlan).toEqual(secondPlan);
		expect(firstPlan.pubkeys).toEqual([pubkeyA, pubkeyC, pubkeyD, pubkeyF]);
		expect(firstPlan.pTagExpansionSourceKeys).toEqual([
			[pubkeyA, 30000, 'z'],
			[pubkeyB, 3, '']
		]);
	});

	test('deduplicates source and unresolved keys in the resulting plan', () => {
		const duplicateKey: LatestEventKey = [pubkeyA, 3, ''];
		const plan = expandPersistentCacheTargets(
			{
				directPubkeys: [pubkeyA],
				pTagExpansionSourceKeys: [duplicateKey, [...duplicateKey] as LatestEventKey]
			},
			[undefined, undefined]
		);

		expect(plan.pTagExpansionSourceKeys).toEqual([duplicateKey]);
		expect(plan.unresolvedPTagExpansionSourceKeys).toEqual([duplicateKey]);
	});

	test('treats a duplicated source as resolved when any matching entry has an event', () => {
		const duplicateKey: LatestEventKey = [pubkeyA, 3, ''];
		const plan = expandPersistentCacheTargets(
			{
				directPubkeys: [pubkeyA],
				pTagExpansionSourceKeys: [duplicateKey, [...duplicateKey] as LatestEventKey]
			},
			[undefined, event(pubkeyA, 3, [['p', pubkeyB]])]
		);

		expect(plan.pubkeys).toEqual([pubkeyA, pubkeyB]);
		expect(plan.pTagExpansionSourceKeys).toEqual([duplicateKey]);
		expect(plan.unresolvedPTagExpansionSourceKeys).toEqual([]);
	});
});
