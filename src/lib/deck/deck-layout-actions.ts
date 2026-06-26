import type { DeckLayoutMode } from '$lib/ui-state';

export type EffectiveDeckLayoutMode = 'deck' | 'single';
type ColumnIdentity = { id: string };

export function getEffectiveDeckLayoutMode(
	mode: DeckLayoutMode,
	isCompactViewport: boolean
): EffectiveDeckLayoutMode {
	if (mode === 'single') return 'single';
	if (mode === 'deck') return 'deck';
	return isCompactViewport ? 'single' : 'deck';
}

export function resolveSingleColumnId(columns: ColumnIdentity[], preferredColumnId: string) {
	if (columns.some((column) => column.id === preferredColumnId)) return preferredColumnId;
	return columns[0]?.id ?? '';
}
