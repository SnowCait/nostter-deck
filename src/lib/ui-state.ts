import { readJsonStorage, writeJsonStorage } from '$lib/local-storage';

export type UiState = {
	sidebarCollapsed: boolean;
};

const uiStateStorageKey = 'nostter:ui-state';

const defaultUiState: UiState = {
	sidebarCollapsed: false
};

function normalizeUiState(value: unknown): UiState {
	if (!value || typeof value !== 'object') return { ...defaultUiState };

	const candidate = value as Partial<UiState>;
	return {
		sidebarCollapsed:
			typeof candidate.sidebarCollapsed === 'boolean'
				? candidate.sidebarCollapsed
				: defaultUiState.sidebarCollapsed
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
