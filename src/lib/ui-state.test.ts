import { beforeEach, describe, expect, test } from 'vitest';
import { normalizeUiState, readUiState, writeUiState } from './ui-state';

describe('ui state storage', () => {
	beforeEach(() => {
		writeUiState({ sidebarCollapsed: false, deckLayoutMode: 'auto' });
	});

	test('falls back when persisted state is invalid', () => {
		expect(normalizeUiState(null)).toEqual({ sidebarCollapsed: false, deckLayoutMode: 'auto' });
	});

	test('falls back when persisted sidebar state has an invalid shape', () => {
		expect(normalizeUiState({ sidebarCollapsed: 'yes' })).toEqual({
			sidebarCollapsed: false,
			deckLayoutMode: 'auto'
		});
	});

	test('falls back when persisted deck layout mode has an invalid shape', () => {
		expect(normalizeUiState({ deckLayoutMode: 'wide' })).toEqual({
			sidebarCollapsed: false,
			deckLayoutMode: 'auto'
		});
	});

	test('round-trips valid ui state', () => {
		writeUiState({ sidebarCollapsed: true, deckLayoutMode: 'single' });

		expect(readUiState()).toEqual({ sidebarCollapsed: true, deckLayoutMode: 'single' });
	});
});
