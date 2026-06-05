import { describe, expect, test } from 'vitest';
import { ChannelMessage, Reaction, Repost, ShortTextNote } from 'nostr-tools/kinds';
import type * as Nostr from 'nostr-typedef';
import {
	emptyTimelineRuntime,
	getReferencedEventId,
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
});
