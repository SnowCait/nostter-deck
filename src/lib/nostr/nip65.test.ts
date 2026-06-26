import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import {
	extractNip65RelayTags,
	getCachedNip65RelayTags,
	getNip65ReadRelays,
	hasNip65WriteRelay,
	nip65CacheStorageKey
} from './nip65';

const pubkey = 'a'.repeat(64);

function installLocalStorage() {
	const values = new Map<string, string>();
	vi.stubGlobal('localStorage', {
		getItem: vi.fn((key: string) => values.get(key) ?? null),
		setItem: vi.fn((key: string, value: string) => values.set(key, value))
	});
	return values;
}

describe('NIP-65 relay lists', () => {
	let storageValues: Map<string, string>;

	beforeEach(() => {
		storageValues = installLocalStorage();
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	test('keeps only valid relay tags and their read/write markers', () => {
		const relayTags = extractNip65RelayTags([
			['r', 'wss://write.example', 'write'],
			['r', 'wss://read.example', 'read'],
			['r', 'wss://both.example'],
			['p', pubkey],
			['r', 'https://invalid.example', 'write'],
			['r', 'wss://unknown.example', 'unknown']
		]);

		expect(relayTags).toEqual([
			['r', 'wss://write.example', 'write'],
			['r', 'wss://read.example', 'read'],
			['r', 'wss://both.example']
		]);
		expect(hasNip65WriteRelay(relayTags)).toBe(true);
		expect(hasNip65WriteRelay([['r', 'wss://read.example', 'read']])).toBe(false);
	});

	test('selects read-capable relays for publishing tagged events', () => {
		expect(
			getNip65ReadRelays([
				['r', 'wss://write.example', 'write'],
				['r', 'wss://read.example', 'read'],
				['r', 'wss://both.example'],
				['r', 'wss://read.example/', 'read']
			])
		).toEqual(['wss://read.example/', 'wss://both.example/']);
	});

	test('restores cached relay tags for the selected account', () => {
		storageValues.set(
			nip65CacheStorageKey,
			JSON.stringify({
				[pubkey]: {
					updatedAt: Date.now(),
					relayTags: [['r', 'wss://relay.example', 'write']]
				}
			})
		);

		expect(getCachedNip65RelayTags(pubkey)).toEqual([['r', 'wss://relay.example', 'write']]);
	});
});
