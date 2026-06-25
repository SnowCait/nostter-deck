import { emptyTimelineRuntime } from './timeline-runtime';
import type { NostrFilter, RelaySelection } from './types';
import type { TimelineRuntime } from './timeline-runtime';
import type { TimelineEventPhase } from '$lib/nostr/timeline';
import type * as Nostr from 'nostr-typedef';

type TimelineSubscription = {
	signature: string;
	stop: () => void;
};

export type TimelineSubscriptionTarget = {
	columnId: string;
	signature: string;
	filters: NostrFilter[];
	relays: RelaySelection;
};

type TimelineSubscriptionManagerOptions = {
	startSubscription: (options: {
		filters: NostrFilter[];
		relays: RelaySelection;
		onEvent: (event: Nostr.Event, meta: { phase: TimelineEventPhase }) => void;
		onReferencedEvent: (referenceEventId: string, event: Nostr.Event) => void;
		onReferencedEventUnavailable: (referenceEventId: string) => void;
		onLoadingChange: (isLoading: boolean) => void;
		onError: (message: string) => void;
	}) => { stop: () => void };
	clearTimelineColumn: (columnId: string, keepTimelineKey?: string) => Promise<void>;
	setRuntime: (columnId: string, runtime: TimelineRuntime) => void;
	updateRuntime: (columnId: string, patch: Partial<TimelineRuntime>) => void;
	removeRuntime: (columnId: string) => void;
	cancelPendingBatch: (columnId: string) => void;
	onEvent: (
		columnId: string,
		timelineKey: string,
		event: Nostr.Event,
		phase: TimelineEventPhase
	) => void;
	onReferencedEvent: (columnId: string, referenceEventId: string, event: Nostr.Event) => void;
	onReferencedEventUnavailable: (columnId: string, referenceEventId: string) => void;
};

export function createTimelineSubscriptionManager({
	startSubscription,
	clearTimelineColumn,
	setRuntime,
	updateRuntime,
	removeRuntime,
	cancelPendingBatch,
	onEvent,
	onReferencedEvent,
	onReferencedEventUnavailable
}: TimelineSubscriptionManagerOptions) {
	const subscriptions = new Map<string, TimelineSubscription>();

	function sync(targets: TimelineSubscriptionTarget[]) {
		const activeColumnIds = new Set(targets.map((target) => target.columnId));

		for (const [columnId, subscription] of subscriptions) {
			if (activeColumnIds.has(columnId)) continue;

			subscription.stop();
			subscriptions.delete(columnId);
			cancelPendingBatch(columnId);
			removeRuntime(columnId);
			void clearTimelineColumn(columnId);
		}

		for (const target of targets) {
			if (subscriptions.get(target.columnId)?.signature === target.signature) continue;

			subscriptions.get(target.columnId)?.stop();
			cancelPendingBatch(target.columnId);
			void clearTimelineColumn(target.columnId, target.signature);
			setRuntime(target.columnId, emptyTimelineRuntime(target.signature));

			const subscription = startSubscription({
				filters: target.filters,
				relays: target.relays,
				onEvent: (event, { phase }) => onEvent(target.columnId, target.signature, event, phase),
				onReferencedEvent: (referenceEventId, event) =>
					onReferencedEvent(target.columnId, referenceEventId, event),
				onReferencedEventUnavailable: (referenceEventId) =>
					onReferencedEventUnavailable(target.columnId, referenceEventId),
				onLoadingChange: (isLoading) => updateRuntime(target.columnId, { isLoading }),
				onError: (error) => updateRuntime(target.columnId, { error })
			});

			subscriptions.set(target.columnId, {
				signature: target.signature,
				stop: subscription.stop
			});
		}
	}

	function stop() {
		for (const subscription of subscriptions.values()) {
			subscription.stop();
		}
		subscriptions.clear();
	}

	return {
		sync,
		stop
	};
}
