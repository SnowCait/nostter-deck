import { Repost, ShortTextNote } from 'nostr-tools/kinds';
import type * as Nostr from 'nostr-typedef';
import type {
	Column,
	ColumnConfig,
	CustomTimelineColumnConfig,
	FollowTimelineColumnConfig,
	NostrFilter,
	RelaySelection,
	SearchTimelineColumnConfig
} from './types';
import { eventToPost, repostEventToPost } from '$lib/nostr/posts';
import { combineRelays, defaultRelays, searchRelays } from '$lib/nostr/relays';
import { getTimelineKey } from './timeline-cache';

export type TimelineRuntime = {
	timelineKey: string;
	visibleEventIds: string[];
	loadedEventsById: Record<string, Nostr.Event>;
	hasOlderStored: boolean;
	hasNewerStored: boolean;
	isLoadingOlder: boolean;
	isLoadingNewer: boolean;
	isLoading: boolean;
	error: string | null;
};

export type TimelineRequest = {
	filters: NostrFilter[];
	relays: RelaySelection;
};

export const timelinePageSize = 100;
export const maxVisibleTimelineEvents = 200;

export function emptyTimelineRuntime(timelineKey = ''): TimelineRuntime {
	return {
		timelineKey,
		visibleEventIds: [],
		loadedEventsById: {},
		hasOlderStored: false,
		hasNewerStored: false,
		isLoadingOlder: false,
		isLoadingNewer: false,
		isLoading: false,
		error: null
	};
}

export type FetchableTimelineColumn =
	| CustomTimelineColumnConfig
	| FollowTimelineColumnConfig
	| SearchTimelineColumnConfig;

export function isFetchableTimelineColumn(column: ColumnConfig): column is FetchableTimelineColumn {
	return column.type === 'timeline';
}

export function getTimelineRequest(column: ColumnConfig): TimelineRequest | null {
	if (!isFetchableTimelineColumn(column)) return null;

	if (column.timelineKind === 'custom') {
		return {
			filters: column.filters,
			relays: column.relays
		};
	}

	if (column.sourceKey === 'timeline_follow') {
		return {
			filters: [{ kinds: [ShortTextNote], authors: `3:${column.pubkey}:` }],
			relays: { type: 'custom', urls: combineRelays([...defaultRelays], column.relays) }
		};
	}

	return {
		filters: [{ kinds: [ShortTextNote], search: column.query, limit: 20 }],
		relays: { type: 'custom', urls: [...searchRelays] }
	};
}

export function getTimelineSignature(request: TimelineRequest) {
	return getTimelineKey(request);
}

export function compareEventsByNip01(left: Nostr.Event, right: Nostr.Event) {
	if (left.created_at !== right.created_at) return right.created_at - left.created_at;

	return left.id.localeCompare(right.id);
}

export function getRepostedEventId(event: Nostr.Event) {
	return event.tags.find((tag) => tag[0] === 'e' && tag[1])?.[1] ?? null;
}

export function timelineRuntimeToPosts(
	runtime: TimelineRuntime,
	getProfile: (pubkey: string) => Nostr.Content.Metadata | undefined
) {
	return runtime.visibleEventIds.flatMap((eventId) => {
		const event = runtime.loadedEventsById[eventId];
		if (!event) return [];

		return [
			event.kind === Repost
				? repostEventToPost(
						event,
						runtime.loadedEventsById[getRepostedEventId(event) ?? ''],
						getProfile
					)
				: eventToPost(event, getProfile(event.pubkey))
		];
	});
}

export function toRuntimeColumn(
	column: ColumnConfig,
	runtime: TimelineRuntime,
	getProfile: (pubkey: string) => Nostr.Content.Metadata | undefined
): Column {
	if (!isFetchableTimelineColumn(column)) {
		return { ...column };
	}

	return {
		...column,
		posts: timelineRuntimeToPosts(runtime, getProfile),
		hasOlderStored: runtime.hasOlderStored,
		hasNewerStored: runtime.hasNewerStored,
		isLoadingOlder: runtime.isLoadingOlder,
		isLoadingNewer: runtime.isLoadingNewer,
		isLoading: runtime.isLoading,
		error: runtime.error
	};
}
