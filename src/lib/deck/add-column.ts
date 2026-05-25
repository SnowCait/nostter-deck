import type { ColumnConfig, ColumnSourceKey, NostrFilter, RelaySelection } from './types';

export type AddColumnType = ColumnSourceKey | 'custom_timeline' | 'website';

export type AddColumnDraft = {
	id: string;
	columnType: AddColumnType;
	websiteUrl: string | null;
	searchQuery: string;
	customTimelineFilters: NostrFilter[] | null;
	customTimelineRelays: RelaySelection | null;
};

export function createColumnConfigFromDraft(draft: AddColumnDraft): ColumnConfig | null {
	if (draft.columnType === 'website') {
		return draft.websiteUrl
			? {
					id: draft.id,
					type: 'website',
					url: draft.websiteUrl,
					width: 'standard'
				}
			: null;
	}

	if (draft.columnType === 'custom_timeline') {
		return draft.customTimelineFilters && draft.customTimelineRelays
			? {
					id: draft.id,
					type: 'timeline',
					timelineKind: 'custom',
					filters: draft.customTimelineFilters,
					relays: draft.customTimelineRelays,
					width: 'standard'
				}
			: null;
	}

	if (draft.columnType === 'timeline_search') {
		const query = draft.searchQuery.trim();
		return query
			? {
					id: draft.id,
					type: 'timeline',
					timelineKind: 'preset',
					sourceKey: draft.columnType,
					query,
					width: 'standard'
				}
			: null;
	}

	return {
		id: draft.id,
		type: 'timeline',
		timelineKind: 'preset',
		sourceKey: draft.columnType,
		width: 'standard'
	};
}
