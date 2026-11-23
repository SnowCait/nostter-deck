import { isAddressableKind, Reaction, Repost } from 'nostr-tools/kinds';
import {
	createRxBackwardReq,
	createRxForwardReq,
	latest,
	now,
	uniq,
	type LazyFilter
} from 'rx-nostr';
import type * as Nostr from 'nostr-typedef';
import { filter, take, takeLast, type Unsubscribable } from 'rxjs';
import type { NostrFilter } from '$lib/nostr/filters';
import type { RelaySelection } from '$lib/nostr/relays';
import { expandAddressAuthors, getFilterAuthorAddress, type AuthorAddress } from './filters';
import { getNostrClient } from './client';
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
	const initialTimelineReq = createRxBackwardReq();
	const liveTimelineReq = createRxForwardReq();
	const subscriptionBoundary = now();
	const pendingFiltersByAddress = new Map<string, NostrFilter[]>();
	const subscriptions: Unsubscribable[] = [];
	let isLoading = false;

	function setLoading(nextIsLoading: boolean) {
		if (isLoading === nextIsLoading) {
			return;
		}

		isLoading = nextIsLoading;
		onLoadingChange(nextIsLoading);
	}

	function addSubscription(subscription: Unsubscribable) {
		subscriptions.push(subscription);

		return () => {
			const index = subscriptions.indexOf(subscription);
			if (index >= 0) {
				subscriptions.splice(index, 1);
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

	function emitTimelineFilters(nextFilters: NostrFilter[]) {
		if (nextFilters.length > 0) {
			initialTimelineReq.emit(nextFilters.map((filter) => withTimelineBoundary(filter, 'initial')));
			liveTimelineReq.emit(nextFilters.map((filter) => withTimelineBoundary(filter, 'live')));
		}
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

	function emitResolvedAddressFilters(
		address: AuthorAddress,
		event: Nostr.Event,
		pendingFilters: NostrFilter[]
	) {
		const authors = [
			...event.tags.flatMap((tag) => (tag[0] === 'p' && tag[1] ? [tag[1]] : [])),
			...(address.kind === 3 ? [address.pubkey] : [])
		];
		const expandedFilters = pendingFilters.flatMap((filter) => {
			const expandedFilter = expandAddressAuthors(filter, authors);
			return expandedFilter ? [expandedFilter] : [];
		});

		emitTimelineFilters(expandedFilters);
	}

	function resolveAddress(address: AuthorAddress, pendingFilters: NostrFilter[]) {
		const addressReq = createRxBackwardReq();
		const addressRelayUrls = address.kind === 3 ? profileRelayUrls : relayUrls;
		let removeSubscription = () => {};

		const subscription = rxNostr
			.use(addressReq)
			.pipe(uniq(), latest(), takeLast(1))
			.subscribe({
				next: ({ event }) => emitResolvedAddressFilters(address, event, pendingFilters),
				complete: () => {
					removeSubscription();
				}
			});

		removeSubscription = addSubscription(subscription);
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
		let removeSubscription = () => {};
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
					removeSubscription();
					if (remaining > 0) {
						onReferencedEventUnavailable(referenceEvent.id);
					}
				}
			});

		removeSubscription = addSubscription(subscription);
		referenceReq.emit({ ids } as LazyFilter, { relays: combineRelays(relayUrls, hints) });
		referenceReq.over();
	}

	function emitInitialTimelineFilters() {
		const directFilters: NostrFilter[] = [];
		const addressesByKey = new Map<string, AuthorAddress>();

		for (const filter of filters) {
			const address = getFilterAuthorAddress(filter);
			if (!address) {
				directFilters.push(filter);
				continue;
			}

			pendingFiltersByAddress.set(address.key, [
				...(pendingFiltersByAddress.get(address.key) ?? []),
				filter
			]);
			addressesByKey.set(address.key, address);
		}

		emitTimelineFilters(directFilters);
		for (const address of addressesByKey.values()) {
			resolveAddress(address, pendingFiltersByAddress.get(address.key) ?? []);
		}
	}

	setLoading(true);

	addSubscription(
		rxNostr
			.use(initialTimelineReq, { on: { relays: relayUrls } })
			.pipe(uniq())
			.subscribe({
				next: ({ event }) => {
					setLoading(false);
					handleTimelineEvent(event, 'initial');
				},
				complete: () => setLoading(false)
			})
	);

	addSubscription(
		rxNostr
			.use(liveTimelineReq, { on: { relays: relayUrls } })
			.pipe(uniq())
			.subscribe(({ event }) => {
				setLoading(false);
				handleTimelineEvent(event, 'live');
			})
	);

	addSubscription(
		rxNostr.createAllErrorObservable().subscribe(({ from, reason }) => {
			if (!relayUrls.includes(from)) {
				return;
			}

			setLoading(false);
			onError(formatRelayError(from, reason));
		})
	);

	emitInitialTimelineFilters();

	function handleTimelineEvent(event: Nostr.Event, phase: TimelineEventPhase) {
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
			for (const subscription of subscriptions) {
				subscription.unsubscribe();
			}
		}
	};
}

function formatRelayError(relay: string, reason: unknown) {
	return reason instanceof Error ? `${relay}: ${reason.message}` : `${relay}: Relay error`;
}
