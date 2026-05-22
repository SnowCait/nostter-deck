export type UiState = {
	sidebarCollapsed: boolean;
};

const uiStateStorageKey = 'nostter:ui-state';

const defaultUiState: UiState = {
	sidebarCollapsed: false
};

function canUseLocalStorage() {
	return typeof localStorage !== 'undefined';
}

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
	if (!canUseLocalStorage()) return { ...defaultUiState };

	try {
		const storedValue = localStorage.getItem(uiStateStorageKey);
		if (!storedValue) return { ...defaultUiState };

		return normalizeUiState(JSON.parse(storedValue));
	} catch {
		return { ...defaultUiState };
	}
}

export function writeUiState(nextState: UiState) {
	if (!canUseLocalStorage()) return;

	localStorage.setItem(uiStateStorageKey, JSON.stringify(normalizeUiState(nextState)));
}

export function updateUiState(updater: (currentState: UiState) => UiState) {
	writeUiState(updater(readUiState()));
}

export { uiStateStorageKey };
