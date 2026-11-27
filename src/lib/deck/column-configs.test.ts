import { describe, expect, test } from 'vitest';
import { normalizeColumnConfigs } from './column-configs';

describe('column config normalization', () => {
	test('drops old-format and invalid columns', () => {
		expect(
			normalizeColumnConfigs([
				{ id: 'old-format', sourceKey: 'timeline_home', width: 'standard' },
				{ id: '', type: 'website', url: 'example.com', width: 'standard' },
				{ id: 'bad-width', type: 'website', url: 'example.com', width: 'huge' },
				{ id: 'bad-url', type: 'website', url: 'http://example.com', width: 'standard' },
				{
					id: 'bad-search',
					type: 'timeline',
					timelineKind: 'preset',
					sourceKey: 'timeline_search',
					query: '   ',
					width: 'standard'
				}
			])
		).toEqual([]);
	});

	test('normalizes display settings and persisted search columns', () => {
		expect(
			normalizeColumnConfigs([
				{
					id: 'search',
					type: 'timeline',
					timelineKind: 'preset',
					sourceKey: 'timeline_search',
					query: ' nostter ',
					width: 'standard',
					title: ' My search ',
					icon: 'radio'
				},
				{
					id: 'invalid-icon',
					type: 'timeline',
					timelineKind: 'preset',
					sourceKey: 'timeline_search',
					query: 'nostter',
					width: 'standard',
					icon: 'invalid'
				}
			])
		).toEqual([
			{
				id: 'search',
				type: 'timeline',
				timelineKind: 'preset',
				sourceKey: 'timeline_search',
				query: 'nostter',
				width: 'standard',
				title: 'My search',
				icon: 'radio'
			},
			{
				id: 'invalid-icon',
				type: 'timeline',
				timelineKind: 'preset',
				sourceKey: 'timeline_search',
				query: 'nostter',
				width: 'standard'
			}
		]);
	});

	test('normalizes Following Timeline columns to target NIP-65 relays', () => {
		expect(
			normalizeColumnConfigs([
				{
					id: 'following-empty',
					type: 'timeline',
					timelineKind: 'preset',
					sourceKey: 'timeline_following',
					pubkey: 'A'.repeat(64),
					relays: [],
					width: 'standard'
				},
				{
					id: 'following-default',
					type: 'timeline',
					timelineKind: 'preset',
					sourceKey: 'timeline_following',
					pubkey: 'B'.repeat(64),
					relays: { type: 'default' },
					width: 'standard'
				}
			])
		).toEqual([
			{
				id: 'following-empty',
				type: 'timeline',
				timelineKind: 'preset',
				sourceKey: 'timeline_following',
				pubkey: 'a'.repeat(64),
				relays: { type: 'nip65', pubkey: 'a'.repeat(64) },
				width: 'standard'
			},
			{
				id: 'following-default',
				type: 'timeline',
				timelineKind: 'preset',
				sourceKey: 'timeline_following',
				pubkey: 'b'.repeat(64),
				relays: { type: 'nip65', pubkey: 'b'.repeat(64) },
				width: 'standard'
			}
		]);
	});

	test('restores the legacy Following Timeline identifier with its saved settings and position', () => {
		const savedColumn = {
			id: 'existing-following-column',
			type: 'timeline',
			timelineKind: 'preset',
			sourceKey: 'timeline_follow',
			pubkey: 'a'.repeat(64),
			relays: { type: 'custom', urls: ['wss://relay.example/'] },
			width: 'wide',
			icon: 'radio',
			title: 'Follow: My feed'
		};
		const firstColumn = {
			id: 'first',
			type: 'website',
			url: 'https://example.com/',
			width: 'narrow'
		};
		const lastColumn = {
			id: 'last',
			type: 'timeline',
			timelineKind: 'preset',
			sourceKey: 'timeline_search',
			query: 'nostr',
			width: 'standard'
		};
		expect(normalizeColumnConfigs([firstColumn, savedColumn, lastColumn])).toEqual([
			firstColumn,
			{ ...savedColumn, sourceKey: 'timeline_following' },
			lastColumn
		]);
	});

	test('normalizes channel, website, and custom columns', () => {
		expect(
			normalizeColumnConfigs([
				{
					id: 'channel',
					type: 'timeline',
					timelineKind: 'preset',
					sourceKey: 'timeline_channel',
					channelId: 'A'.repeat(64),
					relays: ['wss://relay.example'],
					width: 'standard'
				},
				{ id: 'website', type: 'website', url: 'example.com', width: 'wide' },
				{
					id: 'custom',
					type: 'timeline',
					timelineKind: 'custom',
					filters: [{ kinds: [1], limit: 20 }],
					relays: { type: 'nip65', pubkey: 'A'.repeat(64) },
					width: 'narrow'
				}
			])
		).toEqual([
			{
				id: 'channel',
				type: 'timeline',
				timelineKind: 'preset',
				sourceKey: 'timeline_channel',
				channelId: 'a'.repeat(64),
				relays: {
					type: 'custom',
					urls: expect.arrayContaining(['wss://relay.example/'])
				},
				width: 'standard'
			},
			{ id: 'website', type: 'website', url: 'https://example.com/', width: 'wide' },
			{
				id: 'custom',
				type: 'timeline',
				timelineKind: 'custom',
				filters: [{ kinds: [1], limit: 20 }],
				relays: { type: 'nip65', pubkey: 'a'.repeat(64) },
				width: 'narrow'
			}
		]);
	});
});
