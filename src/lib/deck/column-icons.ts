import type { ColumnConfig, ColumnIconKey } from './types';

export const columnIconKeys = ['users', 'search', 'messages', 'radio', 'globe'] as const;

export function isColumnIconKey(value: unknown): value is ColumnIconKey {
	return typeof value === 'string' && columnIconKeys.includes(value as ColumnIconKey);
}

export function getDefaultColumnIconKey(column: ColumnConfig): ColumnIconKey {
	if (column.type === 'website') return 'globe';
	if (column.timelineKind === 'custom') return 'radio';
	if (column.sourceKey === 'timeline_follow') return 'users';
	if (column.sourceKey === 'timeline_channel') return 'messages';

	return 'search';
}

export function getColumnIconKey(column: ColumnConfig): ColumnIconKey {
	return column.icon ?? getDefaultColumnIconKey(column);
}
