import { describe, expect, test } from 'vitest';
import { ChannelMessage, Reaction, Repost, ShortTextNote } from 'nostr-tools/kinds';
import type * as Nostr from 'nostr-typedef';
import {
	emptyTimelineRuntime,
	getReferencedEventId,
	getTimelineRequest,
	mergeTimelineEventBatch,
	mergeTimelineEventIds,
	timelineRuntimeToPosts
} from './timeline-runtime';

function event(
	id: string,
	createdAt: number,
	options: Partial<Pick<Nostr.Event, 'kind' | 'tags'>> = {}
): Nostr.Event {
	return {
		id,
		pubkey: 'a'.repeat(64),
		created_at: createdAt,
		kind: options.kind ?? ShortTextNote,
		tags: options.tags ?? [],
		content: id,
		sig: '0'.repeat(128)
	};
}

describe('timeline runtime', () => {
	test('sorts initial events by NIP-01 order', () => {
		const older = event('b'.repeat(64), 100);
		const sameSecondEarlierId = event('a'.repeat(64), 200);
		const sameSecondLaterId = event('c'.repeat(64), 200);
		const runtime = {
			...emptyTimelineRuntime(),
			loadedEventsById: {
				[older.id]: older,
				[sameSecondEarlierId.id]: sameSecondEarlierId,
				[sameSecondLaterId.id]: sameSecondLaterId
			}
		};

		expect(
			mergeTimelineEventIds(runtime, [older.id, sameSecondLaterId.id, sameSecondEarlierId.id])
		).toEqual([sameSecondEarlierId.id, sameSecondLaterId.id, older.id]);
	});

	test('keeps live events at the top in arrival order', () => {
		const futureLive = event('f'.repeat(64), 999_999);
		const laterLiveArrival = event('d'.repeat(64), 100);
		const initial = event('e'.repeat(64), 500);
		const runtime = {
			...emptyTimelineRuntime(),
			liveEventIds: [laterLiveArrival.id, futureLive.id],
			loadedEventsById: {
				[futureLive.id]: futureLive,
				[laterLiveArrival.id]: laterLiveArrival,
				[initial.id]: initial
			}
		};

		expect(
			mergeTimelineEventIds(runtime, [futureLive.id, laterLiveArrival.id, initial.id])
		).toEqual([laterLiveArrival.id, futureLive.id, initial.id]);
	});

	test('deduplicates boundary events', () => {
		const boundaryEvent = event('1'.repeat(64), 100);
		const runtime = {
			...emptyTimelineRuntime(),
			liveEventIds: [boundaryEvent.id],
			loadedEventsById: {
				[boundaryEvent.id]: boundaryEvent
			}
		};

		expect(mergeTimelineEventIds(runtime, [boundaryEvent.id, boundaryEvent.id])).toEqual([
			boundaryEvent.id
		]);
	});

	test('inserts one historical event without reordering the existing timeline', () => {
		const newest = event('1'.repeat(64), 300);
		const middle = event('2'.repeat(64), 200);
		const inserted = event('3'.repeat(64), 250);
		const oldest = event('4'.repeat(64), 100);
		const runtime = {
			...emptyTimelineRuntime(),
			visibleEventIds: [newest.id, middle.id, oldest.id],
			loadedEventsById: {
				[newest.id]: newest,
				[middle.id]: middle,
				[inserted.id]: inserted,
				[oldest.id]: oldest
			}
		};

		expect(mergeTimelineEventIds(runtime, [...runtime.visibleEventIds, inserted.id])).toEqual([
			newest.id,
			inserted.id,
			middle.id,
			oldest.id
		]);
	});

	test('merges an event batch while keeping later live arrivals first', () => {
		const existingLive = event('1'.repeat(64), 500);
		const existingHistory = event('2'.repeat(64), 300);
		const initialNewer = event('3'.repeat(64), 400);
		const initialOlder = event('4'.repeat(64), 200);
		const firstLive = event('5'.repeat(64), 100);
		const secondLive = event('6'.repeat(64), 50);
		const runtime = {
			...emptyTimelineRuntime(),
			visibleEventIds: [existingLive.id, existingHistory.id],
			liveEventIds: [existingLive.id],
			loadedEventsById: {
				[existingLive.id]: existingLive,
				[existingHistory.id]: existingHistory,
				[initialNewer.id]: initialNewer,
				[initialOlder.id]: initialOlder,
				[firstLive.id]: firstLive,
				[secondLive.id]: secondLive
			}
		};

		expect(
			mergeTimelineEventBatch(
				runtime,
				[initialOlder.id, initialNewer.id],
				[firstLive.id, secondLive.id]
			)
		).toEqual([
			secondLive.id,
			firstLive.id,
			existingLive.id,
			initialNewer.id,
			existingHistory.id,
			initialOlder.id
		]);
	});

	test('uses the last e tag as a reaction reference', () => {
		const reaction = event('7'.repeat(64), 100, {
			kind: Reaction,
			tags: [
				['e', 'first-reference'],
				['p', 'a'.repeat(64)],
				['e', 'last-reference']
			]
		});

		expect(getReferencedEventId(reaction)).toBe('last-reference');
	});

	test('uses the last e tag as a repost reference', () => {
		const repost = event('6'.repeat(64), 100, {
			kind: Repost,
			tags: [
				['e', 'first-reference'],
				['e', 'last-reference']
			]
		});

		expect(getReferencedEventId(repost)).toBe('last-reference');
	});

	test('does not return references for non-repost and non-reaction events', () => {
		const note = event('1'.repeat(64), 100, {
			kind: ShortTextNote,
			tags: [['e', 'referenced-event']]
		});

		expect(getReferencedEventId(note)).toBeNull();
	});

	test('converts channel messages to posts', () => {
		const channelMessage = event('4'.repeat(64), 100, {
			kind: ChannelMessage
		});
		const runtime = {
			...emptyTimelineRuntime(),
			visibleEventIds: [channelMessage.id],
			loadedEventsById: {
				[channelMessage.id]: channelMessage
			}
		};

		expect(timelineRuntimeToPosts(runtime, () => undefined)).toMatchObject([
			{
				id: channelMessage.id,
				body: channelMessage.content
			}
		]);
	});

	test('creates a channel timeline request', () => {
		expect(
			getTimelineRequest({
				id: 'channel',
				type: 'timeline',
				timelineKind: 'preset',
				sourceKey: 'timeline_channel',
				channelId: '4'.repeat(64),
				relays: ['wss://relay.example/'],
				width: 'standard'
			})
		).toEqual({
			filters: [{ kinds: [ChannelMessage], '#e': ['4'.repeat(64)], limit: 20 }],
			relays: {
				type: 'custom',
				urls: expect.arrayContaining(['wss://relay.example/'])
			}
		});
	});

	test('creates a follow timeline request with an initial limit', () => {
		expect(
			getTimelineRequest({
				id: 'follow',
				type: 'timeline',
				timelineKind: 'preset',
				sourceKey: 'timeline_follow',
				pubkey: '5'.repeat(64),
				relays: ['wss://relay.example/'],
				width: 'standard'
			})
		).toEqual({
			filters: [
				{
					kinds: [ShortTextNote],
					authors: `3:${'5'.repeat(64)}:`,
					limit: 20
				}
			],
			relays: {
				type: 'custom',
				urls: expect.arrayContaining(['wss://relay.example/'])
			}
		});
	});
});
