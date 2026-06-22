import { describe, expect, it } from 'vitest';
import {
	addHashtagColumn,
	createUniqueColumnId,
	moveColumn,
	removeColumn,
	reorderColumn
} from './column-actions';
import type { ColumnConfig } from './types';

const columns: ColumnConfig[] = [
	{
		id: 'home',
		type: 'timeline',
		timelineKind: 'preset',
		sourceKey: 'timeline_search',
		query: 'home',
		width: 'standard'
	},
	{
		id: 'site',
		type: 'website',
		url: 'https://example.com',
		width: 'standard'
	}
];

describe('column actions', () => {
	it('generates an ID not used by the deck', () => {
		const generatedIds = ['home', 'new-column'];
		expect(createUniqueColumnId(columns, () => generatedIds.shift() ?? 'unexpected')).toBe(
			'new-column'
		);
	});

	it('inserts a hashtag column directly after its source column', () => {
		const result = addHashtagColumn(columns, 'home', ' nostr ', () => 'nostr');

		expect(result).toMatchObject({ type: 'created', column: { id: 'nostr', query: 'nostr' } });
		expect(result?.type === 'created' && result.columns.map((column) => column.id)).toEqual([
			'home',
			'nostr',
			'site'
		]);
	});

	it('reuses an existing hashtag column', () => {
		const result = addHashtagColumn(columns, 'site', 'home');
		expect(result).toEqual({ type: 'existing', column: columns[0] });
	});

	it('removes a column with its original index', () => {
		expect(removeColumn(columns, 'home')).toMatchObject({
			index: 0,
			columns: [columns[1]]
		});
	});

	it('moves and reorders columns without mutating the input', () => {
		expect(moveColumn(columns, 'home', 1)?.map((column) => column.id)).toEqual(['site', 'home']);
		expect(reorderColumn(columns, 'site', 0)?.map((column) => column.id)).toEqual(['site', 'home']);
		expect(columns.map((column) => column.id)).toEqual(['home', 'site']);
	});

	it('does not return a new list for no-op operations', () => {
		expect(moveColumn(columns, 'home', -1)).toBeNull();
		expect(reorderColumn(columns, 'home', 1)).toBeNull();
		expect(removeColumn(columns, 'unknown')).toBeNull();
		expect(addHashtagColumn(columns, 'home', '   ')).toBeNull();
	});
});
