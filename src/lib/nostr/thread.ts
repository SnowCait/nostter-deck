import { ShortTextNote } from 'nostr-tools/kinds';
import { createRxBackwardReq, uniq, type LazyFilter } from 'rx-nostr';
import type { Unsubscribable } from 'rxjs';
import type * as Nostr from 'nostr-typedef';
import { storeEvent } from '$lib/deck/timeline-cache';
import { getNostrClient } from './client';
import { getThreadReference } from './posts';
import { requestProfiles } from './profiles';
import { combineRelays, defaultRelays, normalizeRelay, profileRelays } from './relays';

export type ThreadEvent = { event: Nostr.Event; depth: number };

type ThreadSubscriptionOptions = {
	selectedEvent: Nostr.Event;
	relays: string[];
	onEvents: (events: Nostr.Event[]) => void;
	onLoadingChange: (isLoading: boolean) => void;
	onError: (message: string) => void;
};

export function startThreadSubscription({
	selectedEvent,
	relays,
	onEvents,
	onLoadingChange,
	onError
}: ThreadSubscriptionOptions) {
	const reference = getThreadReference(selectedEvent);
	if (!reference) {
		onEvents([]);
		return { stop() {} };
	}

	const relayUrls = combineRelays(
		[...defaultRelays],
		relays,
		reference.relayHints.flatMap((relay) => {
			const normalizedRelay = normalizeRelay(relay);
			return normalizedRelay ? [normalizedRelay] : [];
		})
	);
	const eventsById = new Map<string, Nostr.Event>([[selectedEvent.id, selectedEvent]]);
	const request = createRxBackwardReq();

	onLoadingChange(true);
	const subscription: Unsubscribable = getNostrClient()
		.use(request)
		.pipe(uniq())
		.subscribe({
			next: ({ event }) => {
				if (event.kind !== ShortTextNote) return;
				eventsById.set(event.id, event);
				void storeEvent(event);
			},
			complete: () => {
				const events = [...eventsById.values()];
				onLoadingChange(false);
				onEvents(events);
				requestProfiles(
					[...new Set(events.map((event) => event.pubkey))],
					combineRelays([...profileRelays], relayUrls)
				);
			},
			error: (reason) => {
				onLoadingChange(false);
				onError(reason instanceof Error ? reason.message : 'Relay error');
			}
		});

	request.emit(
		[
			{ ids: [...new Set([reference.rootId, selectedEvent.id])] } as LazyFilter,
			{ kinds: [ShortTextNote], '#e': [reference.rootId], limit: 200 } as LazyFilter
		],
		{ relays: relayUrls }
	);
	request.over();

	return {
		stop() {
			subscription?.unsubscribe();
		}
	};
}

export function buildThreadEvents(events: Nostr.Event[], rootId: string): ThreadEvent[] {
	const eventsById = new Map(events.map((event) => [event.id, event]));
	const childrenByParentId = new Map<string, Nostr.Event[]>();

	for (const event of events) {
		if (event.id === rootId) continue;
		const parentId = getThreadReference(event)?.parentId ?? rootId;
		const children = childrenByParentId.get(parentId) ?? [];
		children.push(event);
		childrenByParentId.set(parentId, children);
	}

	for (const children of childrenByParentId.values()) {
		children.sort(compareChronologically);
	}

	const result: ThreadEvent[] = [];
	const visited = new Set<string>();
	function append(event: Nostr.Event, depth: number) {
		if (visited.has(event.id)) return;
		visited.add(event.id);
		result.push({ event, depth });
		for (const child of childrenByParentId.get(event.id) ?? []) append(child, depth + 1);
	}

	const root = eventsById.get(rootId);
	if (root) append(root, 0);
	for (const event of [...events].sort(compareChronologically)) append(event, root ? 1 : 0);
	return result;
}

function compareChronologically(left: Nostr.Event, right: Nostr.Event) {
	if (left.created_at !== right.created_at) return left.created_at - right.created_at;
	return left.id.localeCompare(right.id);
}
