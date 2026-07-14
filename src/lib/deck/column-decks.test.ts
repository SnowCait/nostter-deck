import { beforeEach, describe, expect, test } from 'vitest';
import {
	createDefaultColumnDeckStore,
	duplicateColumnDeck,
	hasColumnDeckName,
	normalizeColumnDeckStore,
	readColumnDeckStore,
	type ColumnDeck,
	writeColumnDeckStore
} from './column-decks';

describe('column deck storage', () => {
	beforeEach(() => {
		writeColumnDeckStore(createDefaultColumnDeckStore());
	});

	test('creates an empty default deck without persisted decks', () => {
		expect(readColumnDeckStore()).toEqual({
			activeDeckId: 'default',
			decks: [
				{
					id: 'default',
					name: 'Default',
					columns: []
				}
			]
		});
	});

	test('normalizes persisted decks and falls back to the first deck', () => {
		expect(
			normalizeColumnDeckStore({
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
		).toEqual({
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
