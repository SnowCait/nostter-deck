import { describe, expect, test, vi } from 'vitest';
import {
	createTimelineSubscriptionManager,
	type TimelineSubscriptionTarget
} from './timeline-subscription-manager';

function target(columnId: string, signature = `${columnId}-signature`): TimelineSubscriptionTarget {
	return {
		columnId,
		signature,
		filters: [{ kinds: [1], limit: 20 }],
		relays: { type: 'default' }
	};
}

describe('timeline subscription manager', () => {
	test('starts subscriptions and keeps unchanged signatures running', () => {
		const starts: string[] = [];
		const stops: string[] = [];
		const manager = createTimelineSubscriptionManager({
			startSubscription: ({ onLoadingChange }) => {
				const subscriptionId = `subscription-${starts.length + 1}`;
				starts.push(subscriptionId);
				onLoadingChange(true);
				return { stop: () => stops.push(subscriptionId) };
			},
			clearTimelineColumn: vi.fn(async () => {}),
			setRuntime: vi.fn(),
			updateRuntime: vi.fn(),
			removeRuntime: vi.fn(),
			cancelPendingBatch: vi.fn(),
			onEvent: vi.fn(),
			onReferencedEvent: vi.fn(),
			onReferencedEventUnavailable: vi.fn()
		});

		manager.sync([target('column')]);
		manager.sync([target('column')]);

		expect(starts).toEqual(['subscription-1']);
		expect(stops).toEqual([]);
	});

	test('restarts changed signatures and removes inactive columns', () => {
		const stops: string[] = [];
		let startCount = 0;
		const clearTimelineColumn = vi.fn(async () => {});
		const setRuntime = vi.fn();
		const removeRuntime = vi.fn();
		const cancelPendingBatch = vi.fn();
		const manager = createTimelineSubscriptionManager({
			startSubscription: () => {
				startCount += 1;
				const subscriptionId = `subscription-${startCount}`;
				return { stop: () => stops.push(subscriptionId) };
			},
			clearTimelineColumn,
			setRuntime,
			updateRuntime: vi.fn(),
			removeRuntime,
			cancelPendingBatch,
			onEvent: vi.fn(),
			onReferencedEvent: vi.fn(),
			onReferencedEventUnavailable: vi.fn()
		});

		manager.sync([target('column', 'old')]);
		manager.sync([target('column', 'new')]);
		manager.sync([]);

		expect(stops).toEqual(['subscription-1', 'subscription-2']);
		expect(cancelPendingBatch).toHaveBeenCalledWith('column');
		expect(clearTimelineColumn).toHaveBeenCalledWith('column', 'old');
		expect(clearTimelineColumn).toHaveBeenCalledWith('column', 'new');
		expect(clearTimelineColumn).toHaveBeenCalledWith('column');
		expect(setRuntime).toHaveBeenLastCalledWith(
			'column',
			expect.objectContaining({ timelineKey: 'new' })
		);
		expect(removeRuntime).toHaveBeenCalledWith('column');
	});

	test('stops every active subscription', () => {
		const stops: string[] = [];
		let startCount = 0;
		const manager = createTimelineSubscriptionManager({
			startSubscription: () => {
				startCount += 1;
				const subscriptionId = `subscription-${startCount}`;
				return { stop: () => stops.push(subscriptionId) };
			},
			clearTimelineColumn: vi.fn(async () => {}),
			setRuntime: vi.fn(),
			updateRuntime: vi.fn(),
			removeRuntime: vi.fn(),
			cancelPendingBatch: vi.fn(),
			onEvent: vi.fn(),
			onReferencedEvent: vi.fn(),
			onReferencedEventUnavailable: vi.fn()
		});

		manager.sync([target('left'), target('right')]);
		manager.stop();

		expect(stops).toEqual(['subscription-1', 'subscription-2']);
	});
});
