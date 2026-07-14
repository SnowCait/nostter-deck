import { getEffectiveDeckLayoutMode, resolveSingleColumnId } from './deck-layout-actions';
import type { ColumnConfig } from './types';
import { readUiState, updateUiState, type DeckLayoutMode } from '$lib/ui-state';

type DeckLayoutControllerOptions = {
	getColumns: () => ColumnConfig[];
	initialColumnId: string;
};

export function createDeckLayoutController({
	getColumns,
	initialColumnId
}: DeckLayoutControllerOptions) {
	let isCompactViewport = $state(false);
	let selectedColumnId = $state(initialColumnId);

	const mode = $derived(readUiState().deckLayoutMode);
	const sidebarCollapsed = $derived(readUiState().sidebarCollapsed);
	const effectiveMode = $derived(getEffectiveDeckLayoutMode(mode, isCompactViewport));
	const isSingleColumn = $derived(effectiveMode === 'single');
	const visibleColumnId = $derived(resolveSingleColumnId(getColumns(), selectedColumnId));

	function persistMode(nextMode: DeckLayoutMode) {
		updateUiState((currentState) => ({
			...currentState,
			deckLayoutMode: nextMode
		}));
	}

	function connectViewport() {
		if (typeof window === 'undefined') {
			return () => {};
		}

		const mediaQuery = window.matchMedia('(max-width: 767px)');
		const updateCompactViewport = () => {
			isCompactViewport = mediaQuery.matches;
		};

		updateCompactViewport();
		mediaQuery.addEventListener('change', updateCompactViewport);
		return () => mediaQuery.removeEventListener('change', updateCompactViewport);
	}

	function showColumn(columnId: string) {
		if (getColumns().some((column) => column.id === columnId)) {
			selectedColumnId = columnId;
		}
	}

	function toggleLayoutMode() {
		persistMode(isSingleColumn ? 'deck' : 'single');
	}

	function toggleSidebar() {
		updateUiState((currentState) => ({
			...currentState,
			sidebarCollapsed: !currentState.sidebarCollapsed
		}));
	}

	function resetSelectedColumn(columnId: string) {
		selectedColumnId = columnId;
	}

	return {
		get mode() {
			return mode;
		},
		get isCompactViewport() {
			return isCompactViewport;
		},
		get isSingleColumn() {
			return isSingleColumn;
		},
		get visibleColumnId() {
			return visibleColumnId;
		},
		get sidebarCollapsed() {
			return sidebarCollapsed;
		},
		connectViewport,
		showColumn,
		toggleLayoutMode,
		toggleSidebar,
		resetSelectedColumn
	};
}
