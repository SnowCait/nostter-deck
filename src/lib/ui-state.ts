import { persistedState } from 'svelte-persisted-state';

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

const uiState = persistedState<UiState>(
	uiStateStorageKey,
	{ ...defaultUiState },
	{
		beforeRead: normalizeUiState
	}
);

function isDeckLayoutMode(value: unknown): value is DeckLayoutMode {
	return typeof value === 'string' && deckLayoutModes.includes(value as DeckLayoutMode);
}

export function normalizeUiState(value: unknown): UiState {
	if (!value || typeof value !== 'object') {
		return { ...defaultUiState };
	}

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
	return uiState.current;
}

export function updateUiState(updater: (currentState: UiState) => UiState) {
	uiState.current = normalizeUiState(updater(uiState.current));
}

export { uiStateStorageKey };
