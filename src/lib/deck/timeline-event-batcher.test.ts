import { afterEach, describe, expect, test, vi } from 'vitest';
import { Repost, ShortTextNote } from 'nostr-tools/kinds';
import type * as Nostr from 'nostr-typedef';
import { createTimelineEventBatcher, deduplicatePendingEvents } from './timeline-event-batcher';
import { emptyTimelineRuntime, type TimelineRuntime } from './timeline-runtime';

function event(
	id: string,
	createdAt: number,
	options: Partial<Pick<Nostr.Event, 'kind' | 'tags' | 'content'>> = {}
): Nostr.Event {
	return {
		id,
		pubkey: 'a'.repeat(64),
		created_at: createdAt,
		kind: options.kind ?? ShortTextNote,
		tags: options.tags ?? [],
		content: options.content ?? id,
		sig: '0'.repeat(128)
	};
}

function createRuntimeStore(initial: TimelineRuntime) {
	let runtime = initial;

	return {
		getRuntime: () => runtime,
		setRuntime: (_columnId: string, nextRuntime: TimelineRuntime) => {
			runtime = nextRuntime;
		},
		updateRuntime: (_columnId: string, patch: Partial<TimelineRuntime>) => {
			runtime = { ...runtime, ...patch };
		},
		read: () => runtime
	};
}

afterEach(() => {
	vi.useRealTimers();
});

describe('timeline event batcher', () => {
	test('deduplicates pending events by keeping the latest occurrence', () => {
		const first = event('1'.repeat(64), 100, { content: 'first' });
		const second = event('2'.repeat(64), 200);
		const replacement = event(first.id, 300, { content: 'replacement' });

		expect(
			deduplicatePendingEvents([
				{ event: first, phase: 'initial' },
				{ event: second, phase: 'initial' },
				{ event: replacement, phase: 'live' }
			])
		).toEqual([
			{ event: second, phase: 'initial' },
			{ event: replacement, phase: 'live' }
		]);
	});

	test('flushes initial and live events in one runtime update', async () => {
		vi.useFakeTimers();
		const initial = event('1'.repeat(64), 100);
		const live = event('2'.repeat(64), 50);
		const store = createRuntimeStore(emptyTimelineRuntime('timeline'));
		const storedEvents: Nostr.Event[][] = [];
		const hydrateReferencedEvents = vi.fn(async () => {});
		const batcher = createTimelineEventBatcher({
			getRuntime: store.getRuntime,
			setRuntime: store.setRuntime,
			updateRuntime: store.updateRuntime,
			storeEvent: vi.fn(async () => {}),
			storeTimelineEvents: vi.fn(async (_columnId, _timelineKey, events) => {
				storedEvents.push(events);
			}),
			hydrateReferencedEvents
		});

		batcher.addEvent('column', 'timeline', initial, 'initial');
		batcher.addEvent('column', 'timeline', live, 'live');
		await vi.advanceTimersByTimeAsync(16);

		expect(store.read().visibleEventIds).toEqual([live.id, initial.id]);
		expect(storedEvents).toEqual([[initial, live]]);
		expect(hydrateReferencedEvents).toHaveBeenCalledWith('column');
	});

	test('adds pending referenced events when their source event is flushed', async () => {
		vi.useFakeTimers();
		const referencedEventId = '9'.repeat(64);
		const repost = event('3'.repeat(64), 100, {
			kind: Repost,
			tags: [['e', referencedEventId]]
		});
		const referenced = event(referencedEventId, 90);
		const store = createRuntimeStore(emptyTimelineRuntime('timeline'));
		const batcher = createTimelineEventBatcher({
			getRuntime: store.getRuntime,
			setRuntime: store.setRuntime,
			updateRuntime: store.updateRuntime,
			storeEvent: vi.fn(async () => {}),
			storeTimelineEvents: vi.fn(async () => {}),
			hydrateReferencedEvents: vi.fn(async () => {})
		});

		batcher.addEvent('column', 'timeline', repost, 'initial');
		batcher.addReferencedEvent('column', repost.id, referenced);
		await vi.advanceTimersByTimeAsync(16);

		expect(store.read().visibleEventIds).toEqual([repost.id]);
		expect(store.read().loadedEventsById[referenced.id]).toEqual(referenced);
	});

	test('cancels unflushed batches', async () => {
		vi.useFakeTimers();
		const store = createRuntimeStore(emptyTimelineRuntime('timeline'));
		const setRuntime = vi.fn(store.setRuntime);
		const batcher = createTimelineEventBatcher({
			getRuntime: store.getRuntime,
			setRuntime,
			updateRuntime: store.updateRuntime,
			storeEvent: vi.fn(async () => {}),
			storeTimelineEvents: vi.fn(async () => {}),
			hydrateReferencedEvents: vi.fn(async () => {})
		});

		batcher.addEvent('column', 'timeline', event('4'.repeat(64), 100), 'initial');
		batcher.cancelPendingBatch('column');
		await vi.advanceTimersByTimeAsync(16);

		expect(setRuntime).not.toHaveBeenCalled();
	});
});
