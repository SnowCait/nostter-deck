import { isAddressableKind } from 'nostr-tools/kinds';
import {
	createRxBackwardReq,
	createRxForwardReq,
	latest,
	latestEach,
	uniq,
	type LazyFilter
} from 'rx-nostr';
import type * as Nostr from 'nostr-typedef';
import { takeLast } from 'rxjs';
import type { NostrFilter, Post, RelaySelection } from '$lib/deck/types';
import { expandAddressAuthors, getFilterAuthorAddress, type AuthorAddress } from './filters';
import { getNostrClient } from './client';
import { combineRelays, profileRelays, resolveRelaySelection } from './relays';

type CustomTimelineSubscriptionOptions = {
	filters: NostrFilter[];
	relays: RelaySelection;
	onUpdate: (posts: Post[]) => void;
	onLoadingChange: (isLoading: boolean) => void;
	onError: (message: string) => void;
};

type Unsubscribable = {
	unsubscribe: () => void;
};

const accentClasses = [
	'bg-sky-500',
	'bg-violet-500',
	'bg-emerald-500',
	'bg-amber-500',
	'bg-rose-500',
	'bg-blue-600',
	'bg-fuchsia-500',
	'bg-orange-500'
];

export function startCustomTimelineSubscription({
	filters,
	relays,
	onUpdate,
	onLoadingChange,
	onError
}: CustomTimelineSubscriptionOptions) {
	const relayUrls = resolveRelaySelection(relays);
	const profileRelayUrls = combineRelays(relayUrls, [...profileRelays]);
	const rxNostr = getNostrClient();
	const timelineReq = createRxForwardReq();
	const profileReq = createRxForwardReq();
	const eventsById = new Map<string, Nostr.Event>();
	const profilesByPubkey = new Map<string, Nostr.Content.Metadata>();
	const requestedProfilePubkeys = new Set<string>();
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

	function emitPosts() {
		onUpdate(
			[...eventsById.values()]
				.sort((left, right) => right.created_at - left.created_at)
				.map((event) => eventToPost(event, profilesByPubkey.get(event.pubkey)))
		);
	}

	function requestProfiles(pubkeys: string[]) {
		const newProfilePubkeys: string[] = [];
		for (const pubkey of pubkeys) {
			if (requestedProfilePubkeys.has(pubkey)) continue;

			requestedProfilePubkeys.add(pubkey);
			newProfilePubkeys.push(pubkey);
		}

		if (newProfilePubkeys.length > 0) {
			profileReq.emit({
				kinds: [0],
				authors: newProfilePubkeys
			});
		}
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

	function emitResolvedAddressFilters(event: Nostr.Event, pendingFilters: NostrFilter[]) {
		const authors = event.tags.flatMap((tag) => (tag[0] === 'p' && tag[1] ? [tag[1]] : []));
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
				next: ({ event }) => emitResolvedAddressFilters(event, pendingFilters),
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
		rxNostr.use(timelineReq, { on: { relays: relayUrls } }).subscribe(({ event }) => {
			onLoadingChange(false);

			if (event.kind !== 1 || eventsById.has(event.id)) return;

			eventsById.set(event.id, event);
			requestProfiles([event.pubkey]);
			emitPosts();
		})
	);

	addSubscription(
		rxNostr
			.use(profileReq, { on: { relays: profileRelayUrls } })
			.pipe(
				uniq(),
				latestEach(({ event }) => event.pubkey)
			)
			.subscribe(({ event }) => {
				const profile = parseProfile(event.content);
				if (!profile) return;

				profilesByPubkey.set(event.pubkey, profile);
				emitPosts();
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

function eventToPost(event: Nostr.Event, profile?: Nostr.Content.Metadata): Post {
	const displayName = profile?.display_name ?? profile?.name;

	return {
		id: event.id,
		author: displayName || shortenPubkey(event.pubkey),
		handle: shortenPubkey(event.pubkey),
		avatarUrl: profile?.picture,
		time: formatRelativeTime(event.created_at),
		body: event.content,
		accent: accentClasses[hashString(event.pubkey) % accentClasses.length],
		tags: event.tags.flatMap((tag) => (tag[0] === 't' && tag[1] ? [`#${tag[1]}`] : [])),
		verified: false,
		stats: {
			replies: '0',
			reposts: '0',
			likes: '0'
		}
	};
}

function parseProfile(content: string): Nostr.Content.Metadata | null {
	try {
		const value = JSON.parse(content);
		if (!value || typeof value !== 'object' || Array.isArray(value)) return null;

		return value as Nostr.Content.Metadata;
	} catch {
		return null;
	}
}

function shortenPubkey(pubkey: string) {
	return `${pubkey.slice(0, 8)}:${pubkey.slice(-4)}`;
}

function formatRelativeTime(createdAt: number) {
	const elapsedSeconds = Math.max(0, Math.floor(Date.now() / 1000) - createdAt);
	if (elapsedSeconds < 60) return `${elapsedSeconds}s`;

	const elapsedMinutes = Math.floor(elapsedSeconds / 60);
	if (elapsedMinutes < 60) return `${elapsedMinutes}m`;

	const elapsedHours = Math.floor(elapsedMinutes / 60);
	if (elapsedHours < 24) return `${elapsedHours}h`;

	return `${Math.floor(elapsedHours / 24)}d`;
}

function hashString(value: string) {
	let hash = 0;
	for (const character of value) {
		hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
	}

	return hash;
}

function formatRelayError(relay: string, reason: unknown) {
	return reason instanceof Error ? `${relay}: ${reason.message}` : `${relay}: Relay error`;
}
