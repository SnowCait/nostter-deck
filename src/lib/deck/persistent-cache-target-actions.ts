import type * as Nostr from 'nostr-typedef';
import type { AccountRecord } from '$lib/nostr/accounts';
import { parseAuthorAddress } from '$lib/nostr/filters';
import { getLatestEventKey, type LatestEventKey } from '$lib/nostr/latest-event-order';
import { normalizePubkey } from '$lib/nostr/pubkeys';
import type { ColumnDeck } from './column-decks';
import { getTimelineRequest } from './timeline-runtime';

export const persistentMetadataKinds = [0, 3, 10002] as const;

export type PersistentCacheSeedTargets = {
	directPubkeys: string[];
	pTagExpansionSourceKeys: LatestEventKey[];
};

export type PersistentCacheTargetPlan = {
	pubkeys: string[];
	pTagExpansionSourceKeys: LatestEventKey[];
	unresolvedPTagExpansionSourceKeys: LatestEventKey[];
};

function compareStrings(left: string, right: string) {
	return left < right ? -1 : left > right ? 1 : 0;
}

function compareLatestEventKeys(left: LatestEventKey, right: LatestEventKey) {
	return (
		compareStrings(left[0], right[0]) || left[1] - right[1] || compareStrings(left[2], right[2])
	);
}

function sortAndDedupePubkeys(pubkeys: Iterable<unknown>) {
	return [...new Set([...pubkeys].flatMap((pubkey) => normalizePubkey(pubkey) ?? []))].sort(
		compareStrings
	);
}

function sortAndDedupeLatestEventKeys(keys: Iterable<LatestEventKey>) {
	const uniqueKeys = new Map<string, LatestEventKey>();
	for (const key of keys) {
		uniqueKeys.set(JSON.stringify(key), key);
	}

	return [...uniqueKeys.values()].sort(compareLatestEventKeys);
}

export function collectPersistentCacheSeedTargets(
	accounts: readonly AccountRecord[],
	decks: readonly ColumnDeck[]
): PersistentCacheSeedTargets {
	const directPubkeys = new Set<string>();
	const pTagExpansionSourceKeys: LatestEventKey[] = [];

	for (const account of accounts) {
		const pubkey = normalizePubkey(account.pubkey);
		if (!pubkey) {
			continue;
		}

		directPubkeys.add(pubkey);
		pTagExpansionSourceKeys.push([pubkey, 3, '']);
	}

	for (const deck of decks) {
		for (const column of deck.columns) {
			const request = getTimelineRequest(column);
			if (!request) {
				continue;
			}

			if (request.relays.type === 'nip65') {
				const pubkey = normalizePubkey(request.relays.pubkey);
				if (pubkey) {
					directPubkeys.add(pubkey);
				}
			}

			for (const filter of request.filters) {
				if (Array.isArray(filter.authors)) {
					for (const author of filter.authors) {
						const pubkey = normalizePubkey(author);
						if (pubkey) {
							directPubkeys.add(pubkey);
						}
					}
					continue;
				}

				const address = parseAuthorAddress(filter.authors);
				if (!address) {
					continue;
				}

				directPubkeys.add(address.pubkey);
				pTagExpansionSourceKeys.push([address.pubkey, address.kind, address.identifier]);
			}
		}
	}

	return {
		directPubkeys: [...directPubkeys].sort(compareStrings),
		pTagExpansionSourceKeys: sortAndDedupeLatestEventKeys(pTagExpansionSourceKeys)
	};
}

function extractPTagPubkeys(event: Nostr.Event) {
	return sortAndDedupePubkeys(event.tags.flatMap((tag) => (tag[0] === 'p' ? [tag[1]] : [])));
}

function latestEventKeysEqual(left: LatestEventKey, right: LatestEventKey) {
	return left[0] === right[0] && left[1] === right[1] && left[2] === right[2];
}

export function expandPersistentCacheTargets(
	seed: PersistentCacheSeedTargets,
	sourceEvents: readonly (Nostr.Event | undefined)[]
): PersistentCacheTargetPlan {
	if (sourceEvents.length !== seed.pTagExpansionSourceKeys.length) {
		throw new Error(
			`Expected ${seed.pTagExpansionSourceKeys.length} source events, received ${sourceEvents.length}`
		);
	}

	const pubkeys = new Set(sortAndDedupePubkeys(seed.directPubkeys));
	const unresolvedPTagExpansionSourceKeys: LatestEventKey[] = [];

	for (const [index, expectedKey] of seed.pTagExpansionSourceKeys.entries()) {
		const event = sourceEvents[index];
		if (!event) {
			unresolvedPTagExpansionSourceKeys.push(expectedKey);
			continue;
		}

		const actualKey = getLatestEventKey(event);
		if (!latestEventKeysEqual(actualKey, expectedKey)) {
			throw new Error(`Source event at index ${index} does not match its expansion source key`);
		}

		for (const pubkey of extractPTagPubkeys(event)) {
			pubkeys.add(pubkey);
		}
	}

	return {
		pubkeys: [...pubkeys].sort(compareStrings),
		pTagExpansionSourceKeys: sortAndDedupeLatestEventKeys(seed.pTagExpansionSourceKeys),
		unresolvedPTagExpansionSourceKeys: sortAndDedupeLatestEventKeys(
			unresolvedPTagExpansionSourceKeys
		)
	};
}
