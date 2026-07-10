import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import {
	createRelaySelectionController,
	getAccountRelayOptions,
	getNip65RelaySelectionPubkeys
} from './relay-selection-controller.svelte';
import type { AccountRecord } from '$lib/nostr/accounts';
import { nip65CacheStorageKey } from '$lib/nostr/nip65';
import { defaultRelays } from '$lib/nostr/relays';

const pubkeyA = 'a'.repeat(64);
const pubkeyB = 'b'.repeat(64);

function installLocalStorage() {
	const values = new Map<string, string>();
	vi.stubGlobal('localStorage', {
		getItem: vi.fn((key: string) => values.get(key) ?? null),
		setItem: vi.fn((key: string, value: string) => values.set(key, value))
	});
	return values;
}

describe('relay selection controller', () => {
	let storageValues: Map<string, string>;

	beforeEach(() => {
		storageValues = installLocalStorage();
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	test('deduplicates saved account relay options by pubkey', () => {
		const accounts: AccountRecord[] = [
			{ id: `nip07:${pubkeyA}`, method: 'nip07', pubkey: pubkeyA, createdAt: 1 },
			{
				id: `nip46:${pubkeyA}`,
				method: 'nip46',
				pubkey: pubkeyA.toUpperCase(),
				createdAt: 2,
				bunker: { pubkey: pubkeyB, relays: ['wss://relay.example'], secret: null },
				clientSecretKey: 'c'.repeat(64)
			},
			{ id: `nip07:${pubkeyB}`, method: 'nip07', pubkey: pubkeyB, createdAt: 3 }
		];

		expect(getAccountRelayOptions(accounts)).toEqual([{ pubkey: pubkeyA }, { pubkey: pubkeyB }]);
	});

	test('resolves account relay lists from persistent cache', () => {
		storageValues.set(
			nip65CacheStorageKey,
			JSON.stringify({
				[pubkeyA]: {
					updatedAt: Date.now(),
					relayTags: [
						['r', 'wss://write.example/', 'write'],
						['r', 'wss://read.example/', 'read']
					]
				}
			})
		);
		const controller = createRelaySelectionController({
			getAccounts: () => [],
			getColumnConfigs: () => []
		});

		expect(controller.resolveRelaySelection({ type: 'nip65', pubkey: pubkeyA })).toEqual([
			'wss://read.example/'
		]);
	});

	test('falls back to default relays until account relay list refresh completes', async () => {
		const controller = createRelaySelectionController({
			getAccounts: () => [],
			getColumnConfigs: () => [],
			refreshRelayTags: async () => [['r', 'wss://fresh.example/', 'read']]
		});

		expect(controller.resolveRelaySelection({ type: 'nip65', pubkey: pubkeyA })).toEqual([
			...defaultRelays
		]);

		controller.refreshNip65ReadRelays(pubkeyA);
		await Promise.resolve();

		expect(controller.resolveRelaySelection({ type: 'nip65', pubkey: pubkeyA })).toEqual([
			'wss://fresh.example/'
		]);
	});

	test('collects preset timeline account relay selections', () => {
		expect(
			getNip65RelaySelectionPubkeys([
				{
					id: 'follow',
					type: 'timeline',
					timelineKind: 'preset',
					sourceKey: 'timeline_follow',
					pubkey: pubkeyB,
					relays: { type: 'nip65', pubkey: pubkeyA },
					width: 'standard'
				}
			])
		).toEqual([pubkeyA]);
	});
});
