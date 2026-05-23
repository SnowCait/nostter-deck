import type { ColumnConfig, ColumnSourceKey, Post } from './types';

export const columnSourceKeys: ColumnSourceKey[] = [
	'timeline_home',
	'timeline_mentions',
	'timeline_search',
	'timeline_lists'
];

export const initialColumnConfigs: ColumnConfig[] = columnSourceKeys.map((sourceKey) => ({
	id: sourceKey,
	type: 'timeline',
	sourceKey,
	width: 'standard'
}));

export const sourcePosts: Record<ColumnSourceKey, Post[]> = {
	timeline_home: [],
	timeline_mentions: [],
	timeline_search: [],
	timeline_lists: []
};
