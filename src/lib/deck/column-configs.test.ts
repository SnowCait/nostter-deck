import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { columnConfigsStorageKey, readColumnConfigs, writeColumnConfigs } from './column-configs';

function installLocalStorage() {
	const values = new Map<string, string>();

	vi.stubGlobal('localStorage', {
		getItem: vi.fn((key: string) => values.get(key) ?? null),
		setItem: vi.fn((key: string, value: string) => {
			values.set(key, value);
		})
	});

	return values;
}

describe('column config storage', () => {
	let storageValues: Map<string, string>;

	beforeEach(() => {
		storageValues = installLocalStorage();
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	test('drops old-format persisted columns', () => {
		storageValues.set(
			columnConfigsStorageKey,
			JSON.stringify([{ id: 'old-format', sourceKey: 'timeline_home', width: 'standard' }])
		);

		expect(readColumnConfigs()).toEqual([]);
	});

	test('drops invalid persisted column icons', () => {
		storageValues.set(
			columnConfigsStorageKey,
			JSON.stringify([
				{
					id: 'search',
					type: 'timeline',
					timelineKind: 'preset',
					sourceKey: 'timeline_search',
					query: 'nostter',
					width: 'standard',
					icon: 'invalid'
				}
			])
		);

		expect(readColumnConfigs()).toEqual([
			{
				id: 'search',
				type: 'timeline',
				timelineKind: 'preset',
				sourceKey: 'timeline_search',
				query: 'nostter',
				width: 'standard'
			}
		]);
	});

	test('normalizes persisted search columns', () => {
		storageValues.set(
			columnConfigsStorageKey,
			JSON.stringify([
				{
					id: 'search',
					type: 'timeline',
					timelineKind: 'preset',
					sourceKey: 'timeline_search',
					query: ' nostter ',
					width: 'standard',
					title: ' My search ',
					icon: 'radio'
				}
			])
		);

		expect(readColumnConfigs()).toEqual([
			{
				id: 'search',
				type: 'timeline',
				timelineKind: 'preset',
				sourceKey: 'timeline_search',
				query: 'nostter',
				width: 'standard',
				title: 'My search',
				icon: 'radio'
			}
		]);
	});

	test('normalizes persisted channel columns', () => {
		storageValues.set(
			columnConfigsStorageKey,
			JSON.stringify([
				{
					id: 'channel',
					type: 'timeline',
					timelineKind: 'preset',
					sourceKey: 'timeline_channel',
					channelId: 'A'.repeat(64),
					relays: ['wss://relay.example'],
					width: 'standard',
					title: ' Channel ',
					icon: 'radio'
				}
			])
		);

		expect(readColumnConfigs()).toEqual([
			{
				id: 'channel',
				type: 'timeline',
				timelineKind: 'preset',
				sourceKey: 'timeline_channel',
				channelId: 'a'.repeat(64),
				relays: ['wss://relay.example/'],
				width: 'standard',
				title: 'Channel',
				icon: 'radio'
			}
		]);
	});

	test('normalizes persisted website columns', () => {
		storageValues.set(
			columnConfigsStorageKey,
			JSON.stringify([
				{
					id: 'website',
					type: 'website',
					url: 'example.com',
					width: 'wide'
				}
			])
		);

		expect(readColumnConfigs()).toEqual([
			{
				id: 'website',
				type: 'website',
				url: 'https://example.com/',
				width: 'wide'
			}
		]);
	});

	test('drops invalid column configs', () => {
		storageValues.set(
			columnConfigsStorageKey,
			JSON.stringify([
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
				},
				{
					id: 'bad-channel',
					type: 'timeline',
					timelineKind: 'preset',
					sourceKey: 'timeline_channel',
					channelId: 'bad',
					width: 'standard'
				}
			])
		);

		expect(readColumnConfigs()).toEqual([]);
	});

	test('round-trips valid column configs', () => {
		writeColumnConfigs([
			{
				id: 'custom',
				type: 'timeline',
				timelineKind: 'custom',
				filters: [{ kinds: [1], limit: 20 }],
				relays: { type: 'default' },
				width: 'narrow'
			}
		]);

		expect(readColumnConfigs()).toEqual([
			{
				id: 'custom',
				type: 'timeline',
				timelineKind: 'custom',
				filters: [{ kinds: [1], limit: 20 }],
				relays: { type: 'default' },
				width: 'narrow'
			}
		]);
	});
});
