import { shouldReplaceCurrentEvent } from '@nostter/nostr-protocol';
import { Contacts, isAddressableKind, Reaction, Repost } from 'nostr-tools/kinds';
import {
	createRxBackwardReq,
	createRxForwardReq,
	createUniq,
	now,
	uniq,
	type EventPacket,
	type LazyFilter
} from 'rx-nostr';
import type * as Nostr from 'nostr-typedef';
import { catchError, EMPTY, filter, finalize, reduce, Subscription, take } from 'rxjs';
import type { NostrFilter } from '$lib/nostr/filters';
import type { RelaySelection } from '$lib/nostr/relays';
import { expandAddressAuthors, getFilterAuthorAddress, type AuthorAddress } from './filters';
import { getNostrClient } from './client';
import { getCachedLatestEvent, putCachedLatestEvent } from './latest-event-cache';
import { getLatestEventKey, type LatestEventKey } from './latest-event-order';
import { requestProfiles } from './profiles';
import { getLastEventTag } from './posts';
import { getVerifiedEmbeddedRepostedEvent } from './reposts';
import { combineRelays, normalizeRelay, profileRelays, resolveRelaySelection } from './relays';

export type TimelineEventPhase = 'initial' | 'live';

type CustomTimelineSubscriptionOptions = {
	filters: NostrFilter[];
	relays: RelaySelection;
	getAdditionalReferenceTags?: (event: Nostr.Event) => string[][];
	onEvent: (event: Nostr.Event, meta: { phase: TimelineEventPhase }) => void;
	onReferencedEvent: (referenceEventId: string, event: Nostr.Event) => void;
	onReferencedEventUnavailable: (referenceEventId: string) => void;
	onLoadingChange: (isLoading: boolean) => void;
	onError: (message: string) => void;
};

export function startCustomTimelineSubscription({
	filters,
	relays,
	getAdditionalReferenceTags,
	onEvent,
	onReferencedEvent,
	onReferencedEventUnavailable,
	onLoadingChange,
	onError
}: CustomTimelineSubscriptionOptions) {
	const relayUrls = resolveRelaySelection(relays);
	const profileRelayUrls = combineRelays(relayUrls, [...profileRelays]);
	const rxNostr = getNostrClient();
	const subscriptionBoundary = now();
	const subscriptions = new Subscription();
	const [uniqueInitialEvents] = createUniq<EventPacket, string>((packet) => packet.event.id);
	const [uniqueLiveEvents] = createUniq<EventPacket, string>((packet) => packet.event.id);
	let pendingInitialWork = 0;
	let isLoading = false;

	function setLoading(nextIsLoading: boolean) {
		if (subscriptions.closed || isLoading === nextIsLoading) {
			return;
		}

		isLoading = nextIsLoading;
		onLoadingChange(nextIsLoading);
	}

	function trackInitialWork() {
		pendingInitialWork += 1;
		return () => {
			pendingInitialWork -= 1;
			if (pendingInitialWork === 0) {
				setLoading(false);
			}
		};
	}

	function withTimelineBoundary(filter: NostrFilter, phase: TimelineEventPhase): LazyFilter {
		if (phase === 'initial') {
			return {
				...filter,
				until: subscriptionBoundary
			} as LazyFilter;
		}

		return {
			...omitFilterKeys(filter, ['limit', 'until']),
			since: subscriptionBoundary
		} as LazyFilter;
	}

	function omitFilterKeys(filter: NostrFilter, omittedKeys: string[]) {
		return Object.fromEntries(
			Object.entries(filter).filter(([key]) => !omittedKeys.includes(key))
		) as NostrFilter;
	}

	function startTimelineFilters(nextFilters: NostrFilter[]) {
		if (nextFilters.length === 0) {
			return;
		}

		const group = new Subscription();
		subscriptions.add(group);
		const relayScope = { on: { relays: relayUrls } };
		const initialReq = createRxBackwardReq();
		const liveReq = createRxForwardReq();
		const finishInitial = trackInitialWork();

		group.add(
			rxNostr
				.use(initialReq, relayScope)
				.pipe(uniqueInitialEvents, finalize(finishInitial))
				.subscribe({
					next: ({ event }) => handleTimelineEvent(event, 'initial'),
					error: (error) => onError(formatRelayError(relayUrls.join(', '), error))
				})
		);
		group.add(
			rxNostr
				.use(liveReq, relayScope)
				.pipe(uniqueLiveEvents)
				.subscribe({
					next: ({ event }) => handleTimelineEvent(event, 'live'),
					error: (error) => onError(formatRelayError(relayUrls.join(', '), error))
				})
		);

		initialReq.emit(nextFilters.map((filter) => withTimelineBoundary(filter, 'initial')));
		initialReq.over();
		liveReq.emit(nextFilters.map((filter) => withTimelineBoundary(filter, 'live')));
		return group;
	}

	function getAddressFilter(address: AuthorAddress): NostrFilter {
		const filter: NostrFilter = {
			kinds: [address.kind],
			authors: [address.pubkey],
			limit: 1
		};

		if (isAddressableKind(address.kind)) {
			filter['#d'] = [address.identifier];
		}

		return filter;
	}

	function resolveAddress(address: AuthorAddress, sourceFilters: NostrFilter[]) {
		const key: LatestEventKey = [address.pubkey, address.kind, address.identifier];
		const addressReq = createRxBackwardReq();
		const addressRelayUrls = address.kind === Contacts ? profileRelayUrls : relayUrls;
		const finishResolution = trackInitialWork();
		let appliedEvent: Nostr.Event | undefined;
		let appliedAuthors: string[] = [];
		let activeGroup: Subscription | undefined;

		function applyEvent(event: Nostr.Event) {
			if (subscriptions.closed || !shouldReplaceCurrentEvent(event, appliedEvent)) {
				return;
			}

			appliedEvent = event;
			const authors = [
				...event.tags.flatMap((tag) => (tag[0] === 'p' && tag[1] ? [tag[1]] : [])),
				...(address.kind === Contacts ? [address.pubkey] : [])
			];
			const expandedFilters = sourceFilters.flatMap((filter) => {
				const expanded = expandAddressAuthors(filter, authors);
				return expanded ? [expanded] : [];
			});
			const nextAuthors = expandedFilters[0]?.authors ?? [];
			const previousAuthors = new Set(appliedAuthors);
			if (
				nextAuthors.length === previousAuthors.size &&
				nextAuthors.every((author) => previousAuthors.has(author))
			) {
				return;
			}

			appliedAuthors = nextAuthors;
			const previousGroup = activeGroup;
			activeGroup = startTimelineFilters(expandedFilters);
			previousGroup?.unsubscribe();
		}

		function readCachedEvent() {
			return getCachedLatestEvent(key).catch(() => undefined);
		}

		const cachedEvent = readCachedEvent().then((event) => {
			if (event) {
				applyEvent(event);
				finishResolution();
			}
			return event;
		});

		subscriptions.add(
			rxNostr
				.use(addressReq)
				.pipe(
					filter(({ event }) => matchesLatestEventKey(event, key)),
					catchError(() => EMPTY),
					reduce(
						(latest: Nostr.Event | undefined, { event }) =>
							shouldReplaceCurrentEvent(event, latest) ? event : latest,
						undefined
					)
				)
				.subscribe(async (networkEvent) => {
					const cached = await cachedEvent;
					if (subscriptions.closed) {
						return;
					}

					if (networkEvent) {
						await putCachedLatestEvent(networkEvent).catch(() => undefined);
						// A concurrent writer may have saved a newer event during the relay request.
						const current = await readCachedEvent();
						applyEvent(
							current && shouldReplaceCurrentEvent(current, networkEvent) ? current : networkEvent
						);
					}
					if (!cached) {
						finishResolution();
					}
				})
		);

		addressReq.emit(getAddressFilter(address) as LazyFilter, { relays: addressRelayUrls });
		addressReq.over();
	}

	function requestReferencedEvents(referenceEvent: Nostr.Event, tags: string[][]) {
		if (tags.length === 0) {
			return;
		}
		const embeddedEvent =
			referenceEvent.kind === Repost ? getVerifiedEmbeddedRepostedEvent(referenceEvent) : null;
		if (embeddedEvent) {
			onReferencedEvent(referenceEvent.id, embeddedEvent);
			requestProfiles([embeddedEvent.pubkey], profileRelayUrls);
			return;
		}

		const ids = [...new Set(tags.map((tag) => tag[1]))];
		const hints = getAdditionalReferenceTags
			? tags.flatMap((tag) => normalizeRelay(tag[2]) ?? [])
			: [];

		const referenceReq = createRxBackwardReq();
		let remaining = ids.length;
		const subscription = rxNostr
			.use(referenceReq)
			.pipe(
				filter(({ event }) => ids.includes(event.id)),
				uniq(),
				take(ids.length)
			)
			.subscribe({
				next: ({ event }) => {
					remaining -= 1;
					onReferencedEvent(referenceEvent.id, event);
					requestProfiles([event.pubkey], profileRelayUrls);
				},
				complete: () => {
					if (remaining > 0) {
						onReferencedEventUnavailable(referenceEvent.id);
					}
				}
			});

		subscriptions.add(subscription);
		referenceReq.emit({ ids } as LazyFilter, { relays: combineRelays(relayUrls, hints) });
		referenceReq.over();
	}

	const directFilters: NostrFilter[] = [];
	const sources = new Map<string, { address: AuthorAddress; filters: NostrFilter[] }>();
	for (const filter of filters) {
		const address = getFilterAuthorAddress(filter);
		if (!address) {
			directFilters.push(filter);
			continue;
		}

		const source = sources.get(address.key);
		if (source) {
			source.filters.push(filter);
		} else {
			sources.set(address.key, { address, filters: [filter] });
		}
	}

	setLoading(true);
	const finishSetup = trackInitialWork();
	subscriptions.add(
		rxNostr.createAllErrorObservable().subscribe(({ from, reason }) => {
			if (!relayUrls.includes(from)) {
				return;
			}

			setLoading(false);
			onError(formatRelayError(from, reason));
		})
	);

	startTimelineFilters(directFilters);
	for (const { address, filters } of sources.values()) {
		resolveAddress(address, filters);
	}
	finishSetup();

	function handleTimelineEvent(event: Nostr.Event, phase: TimelineEventPhase) {
		setLoading(false);
		requestProfiles([event.pubkey], profileRelayUrls);
		onEvent(event, { phase });
		const primaryTag =
			event.kind === Repost || event.kind === Reaction ? getLastEventTag(event) : undefined;
		requestReferencedEvents(event, [
			...(primaryTag ? [primaryTag] : []),
			...(getAdditionalReferenceTags?.(event) ?? [])
		]);
	}

	return {
		stop() {
			subscriptions.unsubscribe();
		}
	};
}

function matchesLatestEventKey(event: Nostr.Event, [pubkey, kind, identifier]: LatestEventKey) {
	try {
		const [eventPubkey, eventKind, eventIdentifier] = getLatestEventKey(event);
		return eventPubkey === pubkey && eventKind === kind && eventIdentifier === identifier;
	} catch {
		return false;
	}
}

function formatRelayError(relay: string, reason: unknown) {
	return reason instanceof Error ? `${relay}: ${reason.message}` : `${relay}: Relay error`;
}
