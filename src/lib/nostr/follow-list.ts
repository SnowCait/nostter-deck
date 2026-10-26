import { shouldReplaceCurrentEvent } from '@nostter/nostr-protocol';
import type * as Nostr from 'nostr-typedef';
import { Contacts } from 'nostr-tools/kinds';
import { createRxBackwardReq } from 'rx-nostr';
import { Subscription } from 'rxjs';
import { getNostrClient } from './client';
import { getCachedLatestEvent, putCachedLatestEvent } from './latest-event-cache';
import { normalizePubkey } from './pubkeys';

const followListRequestTimeoutMs = 5_000;

/**
 * Selects the best available kind 3 event from the persistent cache and configured write relays.
 * Undefined means no event was found during this request, not that none exists.
 * Cache read and write failures reject.
 * The kind 3 request has a five-second network deadline.
 */
export async function getLatestFollowList(
	pubkey: string
): Promise<Nostr.Event<typeof Contacts> | undefined> {
	const normalizedPubkey = normalizePubkey(pubkey);
	if (!normalizedPubkey) {
		throw new Error('Invalid follow list pubkey');
	}

	const cachedEvent = await getCachedLatestEvent([normalizedPubkey, Contacts, '']);
	const cached =
		cachedEvent?.kind === Contacts && normalizePubkey(cachedEvent.pubkey) === normalizedPubkey
			? (cachedEvent as Nostr.Event<typeof Contacts>)
			: undefined;
	const network = await requestFollowList(normalizedPubkey);

	if (network && shouldReplaceCurrentEvent(network, cached)) {
		// use() supplies verified events.
		await putCachedLatestEvent(network);
	}
	// Another request may have saved a newer event while this one was fetching.
	const latestCachedEvent = await getCachedLatestEvent([normalizedPubkey, Contacts, '']);
	if (
		latestCachedEvent?.kind === Contacts &&
		normalizePubkey(latestCachedEvent.pubkey) === normalizedPubkey
	) {
		return latestCachedEvent as Nostr.Event<typeof Contacts>;
	}
	return network;
}

function requestFollowList(pubkey: string): Promise<Nostr.Event<typeof Contacts> | undefined> {
	return new Promise((resolve, reject) => {
		const client = getNostrClient();
		const request = createRxBackwardReq();
		const subscriptions = new Subscription();
		let latest: Nostr.Event<typeof Contacts> | undefined;
		let finished = false;
		const finish = () => {
			if (finished) {
				return;
			}
			finished = true;
			clearTimeout(timeoutId);
			subscriptions.unsubscribe();
			resolve(latest);
		};
		const timeoutId = setTimeout(finish, followListRequestTimeoutMs);

		try {
			subscriptions.add(
				client.use(request, { on: { defaultWriteRelays: true } }).subscribe({
					next: ({ event }) => {
						if (
							event.kind === Contacts &&
							event.pubkey === pubkey &&
							shouldReplaceCurrentEvent(event, latest)
						) {
							latest = event as Nostr.Event<typeof Contacts>;
						}
					},
					complete: finish,
					error: finish
				})
			);
			request.emit({ authors: [pubkey], kinds: [Contacts], limit: 1 });
			request.over();
		} catch (error) {
			finished = true;
			clearTimeout(timeoutId);
			subscriptions.unsubscribe();
			reject(error);
		}
	});
}
