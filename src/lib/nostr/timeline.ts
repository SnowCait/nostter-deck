import { isAddressableKind } from 'nostr-tools/kinds';
import { createRxBackwardReq, createRxForwardReq, latest, uniq, type LazyFilter } from 'rx-nostr';
import type * as Nostr from 'nostr-typedef';
import { takeLast, type Unsubscribable } from 'rxjs';
import type { NostrFilter, RelaySelection } from '$lib/deck/types';
import { expandAddressAuthors, getFilterAuthorAddress, type AuthorAddress } from './filters';
import { getNostrClient } from './client';
import { requestProfiles } from './profiles';
import { combineRelays, profileRelays, resolveRelaySelection } from './relays';

type CustomTimelineSubscriptionOptions = {
	filters: NostrFilter[];
	relays: RelaySelection;
	onEvent: (event: Nostr.Event) => void;
	onLoadingChange: (isLoading: boolean) => void;
	onError: (message: string) => void;
};

export function startCustomTimelineSubscription({
	filters,
	relays,
	onEvent,
	onLoadingChange,
	onError
}: CustomTimelineSubscriptionOptions) {
	const relayUrls = resolveRelaySelection(relays);
	const profileRelayUrls = combineRelays(relayUrls, [...profileRelays]);
	const rxNostr = getNostrClient();
	const timelineReq = createRxForwardReq();
	const pendingFiltersByAddress = new Map<string, NostrFilter[]>();
	const subscriptions: Unsubscribable[] = [];

	function addSubscription(subscription: Unsubscribable) {
		subscriptions.push(subscription);

		return () => {
			const index = subscriptions.indexOf(subscription);
			if (index >= 0) {
				subscriptions.splice(index, 1);
			}
		};
	}

	function emitTimelineFilters(nextFilters: NostrFilter[]) {
		if (nextFilters.length > 0) {
			timelineReq.emit(nextFilters as LazyFilter[]);
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

	onLoadingChange(true);

	addSubscription(
		rxNostr
			.use(timelineReq, { on: { relays: relayUrls } })
			.pipe(uniq())
			.subscribe(({ event }) => {
				onLoadingChange(false);

				requestProfiles([event.pubkey], profileRelayUrls);
				onEvent(event);
			})
	);

	addSubscription(
		rxNostr.createAllErrorObservable().subscribe(({ from, reason }) => {
			if (!relayUrls.includes(from)) return;

			onLoadingChange(false);
			onError(formatRelayError(from, reason));
		})
	);

	emitInitialTimelineFilters();

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
