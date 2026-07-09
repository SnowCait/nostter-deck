import { describe, expect, test } from 'vitest';
import {
	defaultRelays,
	formatCustomRelays,
	normalizeRelay,
	normalizeRelaySelection,
	normalizeRelays,
	parseCustomRelays,
	resolveRelayDraft,
	resolveRelaySelection,
	resolveRelays
} from './relays';

describe('nostr relays', () => {
	test.each([
		['wss://relay.example', 'wss://relay.example/'],
		[' wss://relay.example/path ', 'wss://relay.example/path'],
		['ws://localhost:4869', 'ws://localhost:4869/'],
		['ws://relay.localhost:4869/path', 'ws://relay.localhost:4869/path'],
		['ws://127.0.0.1:4869', 'ws://127.0.0.1:4869/'],
		['ws://127.255.255.254:4869', 'ws://127.255.255.254:4869/'],
		['ws://127.1:4869', 'ws://127.0.0.1:4869/'],
		['ws://[::1]:4869', 'ws://[::1]:4869/']
	])('normalizes %s', (value, expected) => {
		expect(normalizeRelay(value)).toBe(expected);
	});

	test.each([
		'https://relay.example',
		'http://relay.example',
		'ws://relay.example',
		'ws://relay.local',
		'ws://192.168.1.2',
		'ws://10.0.0.2',
		'ws://[::2]',
		'not a url'
	])('rejects %s', (value) => {
		expect(normalizeRelay(value)).toBeNull();
	});

	test('deduplicates normalized relay arrays', () => {
		expect(normalizeRelays(['wss://relay.example', 'wss://relay.example/'])).toEqual([
			'wss://relay.example/'
		]);
	});

	test('rejects empty or partly invalid relay arrays', () => {
		expect(normalizeRelays([])).toBeNull();
		expect(normalizeRelays(['wss://relay.example', 'https://relay.example'])).toBeNull();
	});

	test.each([
		['', []],
		['wss://one.example\nwss://two.example', ['wss://one.example/', 'wss://two.example/']],
		[
			'["wss://one.example", "wss://two.example", "wss://one.example/"]',
			['wss://one.example/', 'wss://two.example/']
		],
		[
			'[\n  "wss://relay.example",\n  "ws://localhost:4869"\n]',
			['wss://relay.example/', 'ws://localhost:4869/']
		],
		['[]', []]
	])('parses custom relay input %s', (value, expected) => {
		expect(parseCustomRelays(value)).toEqual(expected);
	});

	test.each([
		'["wss://relay.example"',
		'{"relay":"wss://relay.example"}',
		'["wss://relay.example", 1]',
		'["wss://relay.example", "https://relay.example"]'
	])('rejects invalid custom relay input %s', (value) => {
		expect(parseCustomRelays(value)).toBeNull();
	});

	test('resolves selected and custom relays', () => {
		expect(resolveRelays(['wss://selected.example'], 'wss://custom.example')).toEqual([
			'wss://selected.example/',
			'wss://custom.example/'
		]);
		expect(resolveRelays([], '')).toBeNull();
	});

	test('creates default and custom relay drafts', () => {
		expect(resolveRelayDraft([...defaultRelays], '')).toEqual({ type: 'default' });
		expect(resolveRelayDraft(['wss://relay.damus.io/'], 'wss://relay.example')).toEqual({
			type: 'custom',
			urls: ['wss://relay.damus.io/', 'wss://relay.example/']
		});
	});

	test('normalizes account relay list selections', () => {
		expect(normalizeRelaySelection({ type: 'nip65', pubkey: 'A'.repeat(64) })).toEqual({
			type: 'nip65',
			pubkey: 'a'.repeat(64)
		});
		expect(normalizeRelaySelection({ type: 'nip65', pubkey: 'bad' })).toBeNull();
	});

	test('resolves account relay list selections with default fallback', () => {
		const pubkey = 'a'.repeat(64);
		expect(
			resolveRelaySelection({ type: 'nip65', pubkey }, (candidatePubkey) =>
				candidatePubkey === pubkey ? ['wss://read.example/'] : []
			)
		).toEqual(['wss://read.example/']);
		expect(resolveRelaySelection({ type: 'nip65', pubkey }, () => [])).toEqual([...defaultRelays]);
	});

	test('formats custom relays by excluding defaults', () => {
		expect(formatCustomRelays(['wss://relay.damus.io/', 'wss://relay.example/'])).toBe(
			'wss://relay.example/'
		);
	});
});
