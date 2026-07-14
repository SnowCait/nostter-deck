import { describe, expect, test, vi } from 'vitest';
import {
	readColumnDeckStore,
	type ColumnDeck,
	type ColumnDeckStore,
	writeColumnDeckStore
} from './column-decks';
import { createColumnDeckController } from './column-deck-controller.svelte';

const firstColumn = {
	id: 'first',
	type: 'timeline',
	timelineKind: 'preset',
	sourceKey: 'timeline_search',
	query: 'nostter',
	width: 'standard'
} as const;
const secondColumn = {
	id: 'second',
	type: 'website',
	url: 'https://example.com/',
	width: 'standard'
} as const;

function createStore(decks: ColumnDeck[], activeDeckId = decks[0].id): ColumnDeckStore {
	return { activeDeckId, decks };
}

function createHarness({
	store = createStore([{ id: 'work', name: 'Work', columns: [firstColumn, secondColumn] }]),
	createIds = []
}: {
	store?: ColumnDeckStore;
	createIds?: string[];
} = {}) {
	writeColumnDeckStore(store);
	const beforeActivateDeck = vi.fn(async () => {});
	const resetFocusMemory = vi.fn();
	const resetSelectedColumn = vi.fn();
	const focusColumn = vi.fn();
	const onColumnDeleted = vi.fn();
	const controller = createColumnDeckController({
		beforeActivateDeck,
		resetFocusMemory,
		resetSelectedColumn,
		focusColumn,
		onColumnDeleted,
		afterStateChange: async () => {},
		createId: () => createIds.shift() ?? 'generated-id'
	});

	return {
		controller,
		beforeActivateDeck,
		resetFocusMemory,
		resetSelectedColumn,
		focusColumn,
		onColumnDeleted
	};
}

describe('column deck controller', () => {
	test('selects a deck and resets transient deck state', async () => {
		const personalColumn = { ...secondColumn, id: 'personal-site' };
		const harness = createHarness({
			store: createStore(
				[
					{ id: 'work', name: 'Work', columns: [firstColumn] },
					{ id: 'personal', name: 'Personal', columns: [personalColumn] }
				],
				'work'
			)
		});
		harness.controller.openSettingsColumnId = 'first';

		await harness.controller.selectDeck('personal');

		expect(harness.beforeActivateDeck).toHaveBeenCalledOnce();
		expect(harness.resetFocusMemory).toHaveBeenCalledOnce();
		expect(harness.controller.store.activeDeckId).toBe('personal');
		expect(harness.controller.columns).toEqual([personalColumn]);
		expect(harness.controller.activeColumnId).toBe('personal-site');
		expect(harness.controller.openSettingsColumnId).toBeNull();
		expect(harness.resetSelectedColumn).toHaveBeenCalledWith('personal-site');
		expect(harness.focusColumn).toHaveBeenCalledWith('personal-site');
	});

	test('duplicates a deck with fresh deck and column IDs', async () => {
		const harness = createHarness({ createIds: ['personal', 'personal-column'] });

		await harness.controller.duplicateDeck('work', 'Personal');

		expect(harness.controller.store.activeDeckId).toBe('personal');
		expect(harness.controller.store.decks[1]).toMatchObject({
			id: 'personal',
			name: 'Personal',
			columns: [{ id: 'personal-column' }, { id: 'generated-id' }]
		});
		expect(harness.controller.columns.map((column) => column.id)).toEqual([
			'personal-column',
			'generated-id'
		]);
	});

	test('deletes the active column and focuses the next available column', async () => {
		const harness = createHarness();
		harness.controller.activeColumnId = 'first';

		await harness.controller.deleteColumn('first');

		expect(harness.controller.columns.map((column) => column.id)).toEqual(['second']);
		expect(harness.controller.activeColumnId).toBe('second');
		expect(harness.controller.openSettingsColumnId).toBeNull();
		expect(harness.onColumnDeleted).toHaveBeenCalledWith('first');
		expect(harness.focusColumn).toHaveBeenCalledWith('second');
	});

	test('adds a column to the active deck and persists it', async () => {
		const harness = createHarness();
		const newColumn = { ...secondColumn, id: 'third' };

		await harness.controller.saveColumn(newColumn);

		expect(harness.controller.columns.map((column) => column.id)).toEqual([
			'first',
			'second',
			'third'
		]);
		expect(harness.focusColumn).toHaveBeenCalledWith('third');
		expect(readColumnDeckStore().decks[0].columns).toHaveLength(3);
	});
});
