import { readJsonStorage, writeJsonStorage } from '$lib/local-storage';

export const deckLayoutModes = ['auto', 'deck', 'single'] as const;
export type DeckLayoutMode = (typeof deckLayoutModes)[number];

export type UiState = {
	sidebarCollapsed: boolean;
	deckLayoutMode: DeckLayoutMode;
};

const uiStateStorageKey = 'nostter:ui-state';

const defaultUiState: UiState = {
	sidebarCollapsed: false,
	deckLayoutMode: 'auto'
};

function isDeckLayoutMode(value: unknown): value is DeckLayoutMode {
	return typeof value === 'string' && deckLayoutModes.includes(value as DeckLayoutMode);
}

function normalizeUiState(value: unknown): UiState {
	if (!value || typeof value !== 'object') return { ...defaultUiState };

	const candidate = value as Partial<UiState>;
	return {
		sidebarCollapsed:
			typeof candidate.sidebarCollapsed === 'boolean'
				? candidate.sidebarCollapsed
				: defaultUiState.sidebarCollapsed,
		deckLayoutMode: isDeckLayoutMode(candidate.deckLayoutMode)
			? candidate.deckLayoutMode
			: defaultUiState.deckLayoutMode
	};
}

export function readUiState(): UiState {
	return readJsonStorage(uiStateStorageKey, { ...defaultUiState }, normalizeUiState);
}

export function writeUiState(nextState: UiState) {
	writeJsonStorage(uiStateStorageKey, nextState, normalizeUiState);
}

export function updateUiState(updater: (currentState: UiState) => UiState) {
	writeUiState(updater(readUiState()));
}

export { uiStateStorageKey };
