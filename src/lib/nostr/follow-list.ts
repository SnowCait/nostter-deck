import { shouldReplaceCurrentEvent } from '@nostter/nostr-protocol';
import type * as Nostr from 'nostr-typedef';
import { Contacts } from 'nostr-tools/kinds';
import { createRxBackwardReq } from 'rx-nostr';
import { Subscription } from 'rxjs';
import { getNostrClient } from './client';
import { getCachedLatestEvent, putCachedLatestEvent } from './latest-event-cache';

const followListRequestTimeoutMs = 5_000;

/**
 * Uses the active account's write relays.
 * Undefined does not guarantee that no follow list exists.
 */
export async function getLatestFollowList(
	pubkey: string
): Promise<Nostr.Event<typeof Contacts> | undefined> {
	const cachedEvent = await getCachedLatestEvent([pubkey, Contacts, '']);
	const cached =
		cachedEvent?.kind === Contacts && cachedEvent.pubkey === pubkey
			? (cachedEvent as Nostr.Event<typeof Contacts>)
			: undefined;
	const network = await requestFollowList(pubkey);

	if (network && shouldReplaceCurrentEvent(network, cached)) {
		// use() supplies verified events.
		await putCachedLatestEvent(network);
	}
	// Another request may have saved a newer event while this one was fetching.
	const latestCachedEvent = await getCachedLatestEvent([pubkey, Contacts, '']);
	if (latestCachedEvent?.kind === Contacts && latestCachedEvent.pubkey === pubkey) {
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
