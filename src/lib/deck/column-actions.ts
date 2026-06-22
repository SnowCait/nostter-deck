import type { ColumnConfig, SearchTimelineColumnConfig } from './types';

type HashtagColumnResult =
	| { type: 'existing'; column: SearchTimelineColumnConfig }
	| { type: 'created'; column: SearchTimelineColumnConfig; columns: ColumnConfig[] };

export function createUniqueColumnId(
	columns: ColumnConfig[],
	createId: () => string = () => crypto.randomUUID()
) {
	const columnIds = new Set(columns.map((column) => column.id));

	while (true) {
		const id = createId();
		if (!columnIds.has(id)) return id;
	}
}

export function addHashtagColumn(
	columns: ColumnConfig[],
	sourceColumnId: string,
	hashtag: string,
	createId: () => string = () => crypto.randomUUID()
): HashtagColumnResult | null {
	const query = hashtag.trim();
	if (!query) return null;

	const existingColumn = columns.find(
		(column): column is SearchTimelineColumnConfig =>
			column.type === 'timeline' &&
			column.timelineKind === 'preset' &&
			column.sourceKey === 'timeline_search' &&
			column.query === query
	);
	if (existingColumn) return { type: 'existing', column: existingColumn };

	const column: SearchTimelineColumnConfig = {
		id: createUniqueColumnId(columns, createId),
		type: 'timeline',
		timelineKind: 'preset',
		sourceKey: 'timeline_search',
		query,
		width: 'standard'
	};
	const nextColumns = [...columns];
	const sourceIndex = columns.findIndex((source) => source.id === sourceColumnId);
	nextColumns.splice(sourceIndex >= 0 ? sourceIndex + 1 : nextColumns.length, 0, column);

	return { type: 'created', column, columns: nextColumns };
}

export function removeColumn(columns: ColumnConfig[], columnId: string) {
	const index = columns.findIndex((column) => column.id === columnId);
	if (index < 0) return null;

	return {
		index,
		columns: columns.filter((column) => column.id !== columnId)
	};
}

export function moveColumn(columns: ColumnConfig[], columnId: string, direction: -1 | 1) {
	const currentIndex = columns.findIndex((column) => column.id === columnId);
	const nextIndex = currentIndex + direction;
	if (currentIndex < 0 || nextIndex < 0 || nextIndex >= columns.length) return null;

	const nextColumns = [...columns];
	const [column] = nextColumns.splice(currentIndex, 1);
	nextColumns.splice(nextIndex, 0, column);
	return nextColumns;
}

export function reorderColumn(columns: ColumnConfig[], columnId: string, targetIndex: number) {
	const currentIndex = columns.findIndex((column) => column.id === columnId);
	if (currentIndex < 0) return null;

	const nextColumns = [...columns];
	const [column] = nextColumns.splice(currentIndex, 1);
	const adjustedTargetIndex = currentIndex < targetIndex ? targetIndex - 1 : targetIndex;
	const nextIndex = Math.max(0, Math.min(adjustedTargetIndex, nextColumns.length));
	if (nextIndex === currentIndex) return null;

	nextColumns.splice(nextIndex, 0, column);
	return nextColumns;
}
