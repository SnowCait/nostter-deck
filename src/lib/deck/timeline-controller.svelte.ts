import {
	clearTimelineColumn,
	hasNewerTimelineEvents,
	hasOlderTimelineEvents,
	loadEventsByIds,
	loadNewerTimelineEvents,
	loadOlderTimelineEvents,
	storeEvent,
	storeTimelineEvents
} from './timeline-cache';
import {
	emptyTimelineRuntime,
	getTimelineRequest,
	getTimelineSignature,
	isFetchableTimelineColumn,
	type TimelineRuntime
} from './timeline-runtime';
import { createTimelineEventBatcher } from './timeline-event-batcher';
import { createTimelinePagination } from './timeline-pagination';
import {
	createTimelineSubscriptionManager,
	type TimelineSubscriptionTarget
} from './timeline-subscription-manager';
import type { ColumnConfig } from './types';
import { startCustomTimelineSubscription } from '$lib/nostr/timeline';

type TimelineControllerOptions = {
	getColumnConfigs: () => ColumnConfig[];
	isReady: () => boolean;
};

export function createTimelineController({ getColumnConfigs, isReady }: TimelineControllerOptions) {
	let runtimes = $state<Record<string, TimelineRuntime>>({});

	const pagination = createTimelinePagination({
		getRuntime,
		setRuntime,
		updateRuntime,
		loadEventsByIds,
		loadOlderTimelineEvents,
		loadNewerTimelineEvents,
		hasOlderTimelineEvents,
		hasNewerTimelineEvents
	});
	const eventBatcher = createTimelineEventBatcher({
		getRuntime,
		setRuntime,
		updateRuntime,
		storeEvent,
		storeTimelineEvents,
		hydrateReferencedEvents: pagination.hydrateReferencedEvents
	});
	const subscriptionManager = createTimelineSubscriptionManager({
		startSubscription: startCustomTimelineSubscription,
		clearTimelineColumn,
		setRuntime,
		updateRuntime,
		removeRuntime,
		cancelPendingBatch: eventBatcher.cancelPendingBatch,
		onEvent: eventBatcher.addEvent,
		onReferencedEvent: eventBatcher.addReferencedEvent,
		onReferencedEventUnavailable: eventBatcher.markReferencedEventUnavailable
	});

	$effect(() => {
		if (!isReady()) return;

		subscriptionManager.sync(getTimelineSubscriptionTargets(getColumnConfigs()));
	});

	function getRuntime(columnId: string) {
		return runtimes[columnId];
	}

	function setRuntime(columnId: string, runtime: TimelineRuntime) {
		runtimes = {
			...runtimes,
			[columnId]: runtime
		};
	}

	function updateRuntime(columnId: string, patch: Partial<TimelineRuntime>) {
		runtimes = {
			...runtimes,
			[columnId]: {
				...(runtimes[columnId] ?? emptyTimelineRuntime()),
				...patch
			}
		};
	}

	function removeRuntime(columnId: string) {
		const nextRuntimes = { ...runtimes };
		delete nextRuntimes[columnId];
		runtimes = nextRuntimes;
	}

	function getTimelineSubscriptionTargets(columns: ColumnConfig[]): TimelineSubscriptionTarget[] {
		return columns.filter(isFetchableTimelineColumn).flatMap((column) => {
			const request = getTimelineRequest(column);
			if (!request) return [];

			const filters = $state.snapshot(request.filters);
			const relays = $state.snapshot(request.relays);
			const signature = getTimelineSignature({ filters, relays });

			return [
				{
					columnId: column.id,
					signature,
					filters,
					relays
				}
			];
		});
	}

	function stop() {
		subscriptionManager.stop();
		eventBatcher.stop();
	}

	return {
		get runtimes() {
			return runtimes;
		},
		loadOlder: pagination.loadOlder,
		loadNewer: pagination.loadNewer,
		stop
	};
}
