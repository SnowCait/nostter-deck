import { shouldReplaceCurrentEvent } from '@nostter/nostr-protocol';
import type * as Nostr from 'nostr-typedef';
import { Contacts } from 'nostr-tools/kinds';
import { createRxBackwardReq } from 'rx-nostr';
import { getNostrClient } from './client';
import { getCachedLatestEvent, putCachedLatestEvent } from './latest-event-cache';

/**
 * Uses the active account's write relays.
 * Undefined does not guarantee that no follow list exists.
 */
export async function getLatestFollowList(
	pubkey: string
): Promise<Nostr.Event<typeof Contacts> | undefined> {
	const cached = await getCachedLatestEvent([pubkey, Contacts, '']);
	const network = await requestFollowList(pubkey);

	if (network && shouldReplaceCurrentEvent(network, cached)) {
		await putCachedLatestEvent(network);
	}
	// Another request may have saved a newer event while this one was fetching.
	const latestCached = await getCachedLatestEvent([pubkey, Contacts, '']);
	return latestCached ?? network;
}

function requestFollowList(pubkey: string): Promise<Nostr.Event<typeof Contacts> | undefined> {
	return new Promise((resolve) => {
		const client = getNostrClient();
		const request = createRxBackwardReq();
		let latest: Nostr.Event<typeof Contacts> | undefined;
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
			complete: () => resolve(latest),
			error: () => resolve(latest)
		});
		request.emit({ authors: [pubkey], kinds: [Contacts], limit: 1 });
		request.over();
	});
}
