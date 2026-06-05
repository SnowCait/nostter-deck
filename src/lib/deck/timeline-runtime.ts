import { ChannelMessage, Reaction, Repost, ShortTextNote } from 'nostr-tools/kinds';
import type * as Nostr from 'nostr-typedef';
import type {
	Column,
	ChannelTimelineColumnConfig,
	ColumnConfig,
	CustomTimelineColumnConfig,
	FollowTimelineColumnConfig,
	NostrFilter,
	RelaySelection,
	SearchTimelineColumnConfig
} from './types';
import { eventToPost, reactionEventToPost, repostEventToPost } from '$lib/nostr/posts';
import { combineRelays, defaultRelays, searchRelays } from '$lib/nostr/relays';
import { getTimelineKey } from './timeline-cache';

export type TimelineRuntime = {
	timelineKey: string;
	visibleEventIds: string[];
	liveEventIds: string[];
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
export const presetTimelineInitialLimit = 20;

export function emptyTimelineRuntime(timelineKey = ''): TimelineRuntime {
	return {
		timelineKey,
		visibleEventIds: [],
		liveEventIds: [],
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
	| SearchTimelineColumnConfig
	| ChannelTimelineColumnConfig;

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
			filters: [
				{
					kinds: [ShortTextNote],
					authors: `3:${column.pubkey}:`,
					limit: presetTimelineInitialLimit
				}
			],
			relays: { type: 'custom', urls: combineRelays([...defaultRelays], column.relays) }
		};
	}

	if (column.sourceKey === 'timeline_channel') {
		return {
			filters: [
				{
					kinds: [ChannelMessage],
					'#e': [column.channelId],
					limit: presetTimelineInitialLimit
				}
			],
			relays: { type: 'custom', urls: combineRelays([...defaultRelays], column.relays) }
		};
	}

	return {
		filters: [{ kinds: [ShortTextNote], search: column.query, limit: presetTimelineInitialLimit }],
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

export function mergeTimelineEventIds(runtime: TimelineRuntime, eventIds: string[]) {
	const eventIdSet = new Set(eventIds.filter((eventId) => runtime.loadedEventsById[eventId]));
	const liveEventIdSet = new Set(runtime.liveEventIds);
	const liveEventIds = runtime.liveEventIds.filter((eventId) => eventIdSet.has(eventId));
	const existingEventIds = runtime.visibleEventIds.filter(
		(eventId) => eventIdSet.has(eventId) && !liveEventIdSet.has(eventId)
	);
	const existingEventIdSet = new Set(existingEventIds);
	const incomingEventIds = [...eventIdSet].filter(
		(eventId) => !liveEventIdSet.has(eventId) && !existingEventIdSet.has(eventId)
	);
	const sortedEventIds = mergeHistoricalEventIds(runtime, existingEventIds, incomingEventIds);

	return [...liveEventIds, ...sortedEventIds];
}

export function mergeTimelineEventBatch(
	runtime: TimelineRuntime,
	initialEventIds: string[],
	liveEventIds: string[]
) {
	const incomingLiveEventIds = uniqueFromEnd(
		liveEventIds.filter((eventId) => runtime.loadedEventsById[eventId])
	);
	const incomingLiveEventIdSet = new Set(incomingLiveEventIds);
	const nextLiveEventIds = [
		...incomingLiveEventIds,
		...runtime.liveEventIds.filter((eventId) => !incomingLiveEventIdSet.has(eventId))
	];
	const liveEventIdSet = new Set(nextLiveEventIds);
	const historicalEventIds = runtime.visibleEventIds.filter(
		(eventId) => !liveEventIdSet.has(eventId)
	);
	const historicalEventIdSet = new Set(historicalEventIds);
	const incomingEventIds = [...new Set(initialEventIds)].filter(
		(eventId) =>
			runtime.loadedEventsById[eventId] &&
			!liveEventIdSet.has(eventId) &&
			!historicalEventIdSet.has(eventId)
	);

	return [
		...nextLiveEventIds,
		...mergeHistoricalEventIds(runtime, historicalEventIds, incomingEventIds)
	];
}

function mergeHistoricalEventIds(
	runtime: TimelineRuntime,
	existingEventIds: string[],
	incomingEventIds: string[]
) {
	if (incomingEventIds.length === 0) return existingEventIds;
	if (incomingEventIds.length === 1) {
		return insertHistoricalEventId(runtime, existingEventIds, incomingEventIds[0]);
	}

	const sortedIncomingEventIds = [...incomingEventIds].sort((leftId, rightId) =>
		compareEventsByNip01(runtime.loadedEventsById[leftId], runtime.loadedEventsById[rightId])
	);
	const mergedEventIds: string[] = [];
	let existingIndex = 0;
	let incomingIndex = 0;

	while (existingIndex < existingEventIds.length && incomingIndex < sortedIncomingEventIds.length) {
		const existingEventId = existingEventIds[existingIndex];
		const incomingEventId = sortedIncomingEventIds[incomingIndex];
		if (
			compareEventsByNip01(
				runtime.loadedEventsById[existingEventId],
				runtime.loadedEventsById[incomingEventId]
			) <= 0
		) {
			mergedEventIds.push(existingEventId);
			existingIndex += 1;
		} else {
			mergedEventIds.push(incomingEventId);
			incomingIndex += 1;
		}
	}

	return [
		...mergedEventIds,
		...existingEventIds.slice(existingIndex),
		...sortedIncomingEventIds.slice(incomingIndex)
	];
}

function insertHistoricalEventId(
	runtime: TimelineRuntime,
	existingEventIds: string[],
	incomingEventId: string
) {
	if (existingEventIds.length === 0) return [incomingEventId];

	const incomingEvent = runtime.loadedEventsById[incomingEventId];
	const firstEvent = runtime.loadedEventsById[existingEventIds[0]];
	if (compareEventsByNip01(incomingEvent, firstEvent) <= 0) {
		return [incomingEventId, ...existingEventIds];
	}

	const lastEvent = runtime.loadedEventsById[existingEventIds.at(-1) ?? ''];
	if (compareEventsByNip01(lastEvent, incomingEvent) <= 0) {
		return [...existingEventIds, incomingEventId];
	}

	let insertIndex = existingEventIds.length - 1;
	while (
		insertIndex > 0 &&
		compareEventsByNip01(
			incomingEvent,
			runtime.loadedEventsById[existingEventIds[insertIndex - 1]]
		) < 0
	) {
		insertIndex -= 1;
	}

	return [
		...existingEventIds.slice(0, insertIndex),
		incomingEventId,
		...existingEventIds.slice(insertIndex)
	];
}

function uniqueFromEnd(eventIds: string[]) {
	const seenEventIds = new Set<string>();
	const uniqueEventIds: string[] = [];

	for (let index = eventIds.length - 1; index >= 0; index -= 1) {
		const eventId = eventIds[index];
		if (seenEventIds.has(eventId)) continue;

		seenEventIds.add(eventId);
		uniqueEventIds.push(eventId);
	}

	return uniqueEventIds;
}

export function getReferencedEventId(event: Nostr.Event) {
	if (event.kind !== Repost && event.kind !== Reaction) return null;

	return event.tags.findLast((tag) => tag[0] === 'e' && tag[1])?.[1] ?? null;
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
						runtime.loadedEventsById[getReferencedEventId(event) ?? ''],
						getProfile
					)
				: event.kind === Reaction
					? reactionEventToPost(
							event,
							runtime.loadedEventsById[getReferencedEventId(event) ?? ''],
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
