import { Repost, ShortTextNote } from 'nostr-tools/kinds';
import type * as Nostr from 'nostr-typedef';
import { isShortTextNoteReplyEvent } from '$lib/nostr/posts';
import { compareEventsByNip01, type TimelineRuntime } from './timeline-runtime';

export function isProfilePostEvent(event: Nostr.Event) {
	return (
		event.kind === Repost || (event.kind === ShortTextNote && !isShortTextNoteReplyEvent(event))
	);
}

export function addProfilePostEvent(runtime: TimelineRuntime, event: Nostr.Event) {
	if (!isProfilePostEvent(event)) return runtime;

	const loadedEventsById = { ...runtime.loadedEventsById, [event.id]: event };
	const visibleEventIds = [...new Set([...runtime.visibleEventIds, event.id])].sort(
		(leftId, rightId) => compareEventsByNip01(loadedEventsById[leftId], loadedEventsById[rightId])
	);

	return {
		...runtime,
		loadedEventsById,
		visibleEventIds
	};
}

export function addProfileReferencedEvent(
	runtime: TimelineRuntime,
	referenceEventId: string,
	event: Nostr.Event
) {
	return {
		...runtime,
		loadedEventsById: { ...runtime.loadedEventsById, [event.id]: event },
		unavailableReferenceEventIds: runtime.unavailableReferenceEventIds.filter(
			(eventId) => eventId !== referenceEventId
		)
	};
}

export function markProfileReferencedEventUnavailable(
	runtime: TimelineRuntime,
	referenceEventId: string
) {
	return {
		...runtime,
		unavailableReferenceEventIds: runtime.unavailableReferenceEventIds.includes(referenceEventId)
			? runtime.unavailableReferenceEventIds
			: [...runtime.unavailableReferenceEventIds, referenceEventId]
	};
}
