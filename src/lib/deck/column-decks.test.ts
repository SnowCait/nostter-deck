import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { columnConfigsStorageKey } from './column-configs';
import {
	columnDecksStorageKey,
	duplicateColumnDeck,
	hasColumnDeckName,
	readColumnDeckStore,
	type ColumnDeck
} from './column-decks';

function installLocalStorage() {
	const values = new Map<string, string>();
	vi.stubGlobal('localStorage', {
		getItem: vi.fn((key: string) => values.get(key) ?? null),
		setItem: vi.fn((key: string, value: string) => values.set(key, value))
	});
	return values;
}

describe('column deck storage', () => {
	let storageValues: Map<string, string>;

	beforeEach(() => {
		storageValues = installLocalStorage();
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	test('migrates legacy columns into the default deck', () => {
		storageValues.set(
			columnConfigsStorageKey,
			JSON.stringify([
				{
					id: 'search',
					type: 'timeline',
					timelineKind: 'preset',
					sourceKey: 'timeline_search',
					query: 'nostter',
					width: 'standard'
				}
			])
		);

		expect(readColumnDeckStore()).toEqual({
			activeDeckId: 'default',
			decks: [
				{
					id: 'default',
					name: 'Default',
					columns: [
						{
							id: 'search',
							type: 'timeline',
							timelineKind: 'preset',
							sourceKey: 'timeline_search',
							query: 'nostter',
							width: 'standard'
						}
					]
				}
			]
		});
		expect(storageValues.get(columnDecksStorageKey)).toContain('"activeDeckId":"default"');
	});

	test('normalizes persisted decks and falls back to the first deck', () => {
		storageValues.set(
			columnDecksStorageKey,
			JSON.stringify({
				activeDeckId: 'missing',
				decks: [
					{
						id: 'work',
						name: ' Work ',
						columns: [{ id: 'site', type: 'website', url: 'example.com', width: 'wide' }]
					},
					{
						id: 'duplicate-name',
						name: 'work',
						columns: []
					}
				]
			})
		);

		expect(readColumnDeckStore()).toEqual({
			activeDeckId: 'work',
			decks: [
				{
					id: 'work',
					name: 'Work',
					columns: [{ id: 'site', type: 'website', url: 'https://example.com/', width: 'wide' }]
				}
			]
		});
	});

	test('detects duplicate names case-insensitively', () => {
		const decks: ColumnDeck[] = [{ id: 'work', name: 'Work', columns: [] }];

		expect(hasColumnDeckName(decks, ' work ')).toBe(true);
		expect(hasColumnDeckName(decks, 'Work', 'work')).toBe(false);
		expect(hasColumnDeckName(decks, 'Personal')).toBe(false);
	});

	test('duplicates columns with new IDs', () => {
		const source: ColumnDeck = {
			id: 'work',
			name: 'Work',
			columns: [
				{
					id: 'search',
					type: 'timeline',
					timelineKind: 'preset',
					sourceKey: 'timeline_search',
					query: 'nostter',
					width: 'standard'
				}
			]
		};

		const duplicate = duplicateColumnDeck(source, 'personal', 'Personal', () => 'new-search');

		expect(duplicate).toEqual({
			id: 'personal',
			name: 'Personal',
			columns: [
				{
					id: 'new-search',
					type: 'timeline',
					timelineKind: 'preset',
					sourceKey: 'timeline_search',
					query: 'nostter',
					width: 'standard'
				}
			]
		});
		expect(duplicate?.columns[0]).not.toBe(source.columns[0]);
	});
});
