import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { readUiState, uiStateStorageKey, writeUiState } from './ui-state';

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

describe('ui state storage', () => {
	let storageValues: Map<string, string>;

	beforeEach(() => {
		storageValues = installLocalStorage();
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	test('falls back when persisted state is invalid JSON', () => {
		storageValues.set(uiStateStorageKey, 'not-json');

		expect(readUiState()).toEqual({ sidebarCollapsed: false, deckLayoutMode: 'auto' });
	});

	test('falls back when persisted sidebar state has an invalid shape', () => {
		storageValues.set(uiStateStorageKey, JSON.stringify({ sidebarCollapsed: 'yes' }));

		expect(readUiState()).toEqual({ sidebarCollapsed: false, deckLayoutMode: 'auto' });
	});

	test('falls back when persisted deck layout mode has an invalid shape', () => {
		storageValues.set(uiStateStorageKey, JSON.stringify({ deckLayoutMode: 'wide' }));

		expect(readUiState()).toEqual({ sidebarCollapsed: false, deckLayoutMode: 'auto' });
	});

	test('round-trips valid ui state', () => {
		writeUiState({ sidebarCollapsed: true, deckLayoutMode: 'single' });

		expect(readUiState()).toEqual({ sidebarCollapsed: true, deckLayoutMode: 'single' });
	});
});
