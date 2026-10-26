import { shouldReplaceCurrentEvent } from '@nostter/nostr-protocol';
import type * as Nostr from 'nostr-typedef';
import { Contacts } from 'nostr-tools/kinds';
import { createRxBackwardReq } from 'rx-nostr';
import { Subscription } from 'rxjs';
import { getNostrClient } from './client';
import { getCachedLatestEvent, putCachedLatestEvent } from './latest-event-cache';
import { getNip65WriteRelaysForPubkey } from './nip65';
import { normalizePubkey } from './pubkeys';
import { combineRelays, defaultRelays, normalizeRelay } from './relays';

export type FollowListResult =
	| { status: 'found'; event: Nostr.Event<typeof Contacts> }
	| { status: 'not-found' }
	| { status: 'unavailable' };

const followListRequestTimeoutMs = 5_000;

/**
 * Selects the best available kind 3 event from the persistent cache and account write relays.
 * Cache failures reject: they must not be mistaken for an absent follow list.
 * Relay discovery and the kind 3 request each have a five-second network deadline.
 */
export async function getLatestFollowList(pubkey: string): Promise<FollowListResult> {
	const normalizedPubkey = normalizePubkey(pubkey);
	if (!normalizedPubkey) {
		throw new Error('Invalid follow list pubkey');
	}

	const cachedEvent = await getCachedLatestEvent([normalizedPubkey, Contacts, '']);
	const cached =
		cachedEvent?.kind === Contacts && normalizePubkey(cachedEvent.pubkey) === normalizedPubkey
			? (cachedEvent as Nostr.Event<typeof Contacts>)
			: undefined;
	const client = getNostrClient();
	const accountWriteRelays = await getNip65WriteRelaysForPubkey(normalizedPubkey);
	const relays = combineRelays(
		accountWriteRelays,
		Object.keys(client.getDefaultRelays({ filter: 'write-all' }))
	).flatMap((url) => {
		const relay = normalizeRelay(url);
		return relay ? [relay] : [];
	});
	const network = await requestFollowList(
		normalizedPubkey,
		combineRelays(relays.length > 0 ? relays : [...defaultRelays])
	);

	if (network.status === 'found' && shouldReplaceCurrentEvent(network.event, cached)) {
		// use() supplies verified events; raw message monitoring is only used for EOSE.
		await putCachedLatestEvent(network.event);
	}
	// Another request may have saved a newer event while this one was fetching.
	const latestCachedEvent = await getCachedLatestEvent([normalizedPubkey, Contacts, '']);
	if (
		latestCachedEvent?.kind === Contacts &&
		normalizePubkey(latestCachedEvent.pubkey) === normalizedPubkey
	) {
		return { status: 'found', event: latestCachedEvent as Nostr.Event<typeof Contacts> };
	}
	return network;
}

function requestFollowList(pubkey: string, relays: string[]): Promise<FollowListResult> {
	return new Promise((resolve, reject) => {
		const client = getNostrClient();
		const requestId = `follow-list-${crypto.randomUUID()}`;
		const request = createRxBackwardReq(requestId);
		// rx-nostr 3.7.4 appends the emission index to the supplied ID (one emit here).
		const subId = `${requestId}:0`;
		const subscriptions = new Subscription();
		const queriedRelays = new Set<string>();
		let latest: Nostr.Event<typeof Contacts> | undefined;
		let receivedEose = false;
		let finished = false;
		const finish = () => {
			if (finished) {
				return;
			}
			finished = true;
			clearTimeout(timeoutId);
			subscriptions.unsubscribe();
			resolve(
				latest
					? { status: 'found', event: latest }
					: { status: receivedEose ? 'not-found' : 'unavailable' }
			);
		};
		const timeoutId = setTimeout(finish, followListRequestTimeoutMs);

		try {
			subscriptions.add(
				client.createOutgoingMessageObservable().subscribe(({ to, message }) => {
					const relay = normalizeRelay(to);
					if (message[0] === 'REQ' && message[1] === subId && relay && relays.includes(relay)) {
						queriedRelays.add(relay);
					}
				})
			);
			subscriptions.add(
				client.createAllMessageObservable().subscribe((packet) => {
					if (
						packet.type === 'EOSE' &&
						packet.subId === subId &&
						queriedRelays.has(normalizeRelay(packet.from) ?? '')
					) {
						receivedEose = true;
					}
				})
			);
			subscriptions.add(
				client.use(request).subscribe({
					next: ({ event }) => {
						if (
							event.kind === Contacts &&
							event.pubkey === pubkey &&
							shouldReplaceCurrentEvent(event, latest)
						) {
							latest = event as Nostr.Event<typeof Contacts>;
						}
					},
					// Completion also occurs on timeout/disconnection. Let raw EOSE monitoring
					// receive the same message before tearing down its listener.
					complete: () => queueMicrotask(finish),
					error: () => queueMicrotask(finish)
				})
			);
			request.emit({ authors: [pubkey], kinds: [Contacts], limit: 1 }, { relays });
			request.over();
		} catch (error) {
			finished = true;
			clearTimeout(timeoutId);
			subscriptions.unsubscribe();
			reject(error);
		}
	});
}
