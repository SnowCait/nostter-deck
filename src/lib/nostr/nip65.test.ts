import { describe, expect, test } from 'vitest';
import {
	extractNip65RelayTags,
	getNip65ReadRelays,
	hasNip65WriteRelay,
	normalizeNip65Cache
} from './nip65';

const pubkey = 'a'.repeat(64);

describe('NIP-65 relay lists', () => {
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

	test('normalizes cached relay tags for the selected account', () => {
		expect(
			normalizeNip65Cache({
				[pubkey]: {
					updatedAt: Date.now(),
					relayTags: [['r', 'wss://relay.example', 'write']]
				}
			})
		).toEqual({
			[pubkey]: {
				updatedAt: expect.any(Number),
				relayTags: [['r', 'wss://relay.example', 'write']]
			}
		});
	});
});
