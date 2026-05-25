import type * as Nostr from 'nostr-typedef';
import type {
	Column,
	ColumnConfig,
	CustomTimelineColumnConfig,
	NostrFilter,
	RelaySelection,
	SearchTimelineColumnConfig
} from './types';
import { eventToPost } from '$lib/nostr/posts';
import { searchRelays } from '$lib/nostr/relays';

export type TimelineRuntime = {
	eventsById: Record<string, Nostr.Event>;
	isLoading: boolean;
	error: string | null;
};

export type TimelineRequest = {
	filters: NostrFilter[];
	relays: RelaySelection;
};

export function emptyTimelineRuntime(): TimelineRuntime {
	return {
		eventsById: {},
		isLoading: false,
		error: null
	};
}

export type FetchableTimelineColumn = CustomTimelineColumnConfig | SearchTimelineColumnConfig;

export function isFetchableTimelineColumn(column: ColumnConfig): column is FetchableTimelineColumn {
	return (
		column.type === 'timeline' &&
		(column.timelineKind === 'custom' ||
			(column.timelineKind === 'preset' && column.sourceKey === 'timeline_search'))
	);
}

export function getTimelineRequest(column: ColumnConfig): TimelineRequest | null {
	if (!isFetchableTimelineColumn(column)) return null;

	if (column.timelineKind === 'custom') {
		return {
			filters: column.filters,
			relays: column.relays
		};
	}

	return {
		filters: [{ kinds: [1], search: column.query, limit: 20 }],
		relays: { type: 'custom', urls: [...searchRelays] }
	};
}

export function getTimelineSignature(request: TimelineRequest) {
	return JSON.stringify(request);
}

export function timelineRuntimeToPosts(
	runtime: TimelineRuntime,
	getProfile: (pubkey: string) => Nostr.Content.Metadata | undefined
) {
	return Object.values(runtime.eventsById)
		.sort((left, right) => right.created_at - left.created_at)
		.map((event) => eventToPost(event, getProfile(event.pubkey)));
}

export function toRuntimeColumn(
	column: ColumnConfig,
	runtime: TimelineRuntime,
	getProfile: (pubkey: string) => Nostr.Content.Metadata | undefined
): Column {
	if (!isFetchableTimelineColumn(column)) {
		return column.type === 'timeline' ? { ...column, posts: [] } : { ...column };
	}

	return {
		...column,
		posts: timelineRuntimeToPosts(runtime, getProfile),
		isLoading: runtime.isLoading,
		error: runtime.error
	};
}
