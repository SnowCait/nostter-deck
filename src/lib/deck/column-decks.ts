import { readJsonStorage, writeJsonStorage } from '$lib/local-storage';
import { normalizeColumnConfigs, readColumnConfigs } from './column-configs';
import type { ColumnConfig } from './types';

export type ColumnDeck = {
	id: string;
	name: string;
	columns: ColumnConfig[];
};

export type ColumnDeckStore = {
	activeDeckId: string;
	decks: ColumnDeck[];
};

export const columnDecksStorageKey = 'nostter:column-decks';
export const defaultColumnDeckId = 'default';
export const defaultColumnDeckName = 'Default';

function normalizeDeckName(value: unknown) {
	return typeof value === 'string' ? value.trim() : '';
}

function hasDuplicateName(decks: ColumnDeck[], name: string, exceptId?: string) {
	const normalizedName = name.toLocaleLowerCase();
	return decks.some(
		(deck) => deck.id !== exceptId && deck.name.toLocaleLowerCase() === normalizedName
	);
}

function normalizeColumnDecks(value: unknown): ColumnDeck[] {
	if (!Array.isArray(value)) return [];

	const deckIds = new Set<string>();
	const decks: ColumnDeck[] = [];
	for (const valueItem of value) {
		if (!valueItem || typeof valueItem !== 'object') continue;
		const candidate = valueItem as Partial<ColumnDeck>;
		const id = typeof candidate.id === 'string' ? candidate.id : '';
		const name = normalizeDeckName(candidate.name);
		if (!id || !name || deckIds.has(id) || hasDuplicateName(decks, name)) continue;

		decks.push({
			id,
			name,
			columns: normalizeColumnConfigs(candidate.columns)
		});
		deckIds.add(id);
	}

	return decks;
}

function normalizeColumnDeckStore(value: unknown): ColumnDeckStore | null {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
	const candidate = value as Partial<ColumnDeckStore>;
	const decks = normalizeColumnDecks(candidate.decks);
	if (decks.length === 0) return null;

	const activeDeckId = decks.some((deck) => deck.id === candidate.activeDeckId)
		? (candidate.activeDeckId as string)
		: decks[0].id;
	return { activeDeckId, decks };
}

export function createColumnDeck(
	id: string,
	name: string,
	columns: ColumnConfig[] = []
): ColumnDeck | null {
	const normalizedName = normalizeDeckName(name);
	if (!id || !normalizedName) return null;
	return { id, name: normalizedName, columns };
}

export function readColumnDeckStore(): ColumnDeckStore {
	const stored = readJsonStorage<ColumnDeckStore | null>(
		columnDecksStorageKey,
		null,
		normalizeColumnDeckStore
	);
	if (stored) return stored;

	const migrated: ColumnDeckStore = {
		activeDeckId: defaultColumnDeckId,
		decks: [
			{
				id: defaultColumnDeckId,
				name: defaultColumnDeckName,
				columns: readColumnConfigs()
			}
		]
	};
	writeColumnDeckStore(migrated);
	return migrated;
}

export function writeColumnDeckStore(store: ColumnDeckStore) {
	const normalized = normalizeColumnDeckStore(store);
	if (!normalized) return;
	writeJsonStorage(
		columnDecksStorageKey,
		normalized,
		(value) => normalizeColumnDeckStore(value) ?? normalized
	);
}

export function hasColumnDeckName(decks: ColumnDeck[], name: string, exceptId?: string) {
	const normalizedName = normalizeDeckName(name);
	return !normalizedName || hasDuplicateName(decks, normalizedName, exceptId);
}

export function duplicateColumnDeck(
	deck: ColumnDeck,
	id: string,
	name: string,
	createColumnId: () => string
): ColumnDeck | null {
	const duplicate = createColumnDeck(
		id,
		name,
		deck.columns.map((column) => ({ ...structuredClone(column), id: createColumnId() }))
	);
	return duplicate;
}
