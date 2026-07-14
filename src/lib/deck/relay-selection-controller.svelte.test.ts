import { describe, expect, test } from 'vitest';
import {
	createRelaySelectionController,
	getAccountRelayOptions,
	getNip65RelaySelectionPubkeys
} from './relay-selection-controller.svelte';
import type { AccountRecord } from '$lib/nostr/accounts';
import { defaultRelays } from '$lib/nostr/relays';

const pubkeyA = 'a'.repeat(64);
const pubkeyB = 'b'.repeat(64);

describe('relay selection controller', () => {
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
		const controller = createRelaySelectionController({
			getAccounts: () => [],
			getColumnConfigs: () => [],
			getCachedRelayTags: () => [
				['r', 'wss://write.example/', 'write'],
				['r', 'wss://read.example/', 'read']
			]
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
