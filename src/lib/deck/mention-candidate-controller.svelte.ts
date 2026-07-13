import { Contacts } from 'nostr-tools/kinds';
import { createRxBackwardReq, type LazyFilter } from 'rx-nostr';
import type * as Nostr from 'nostr-typedef';
import type { Unsubscribable } from 'rxjs';
import { getNostrClient } from '$lib/nostr/client';
import { getNip65ReadRelaysForPubkey } from '$lib/nostr/nip65';
import { normalizePubkey } from '$lib/nostr/pubkeys';
import { defaultRelays, profileRelays } from '$lib/nostr/relays';
import { listCachedProfiles, requestProfiles, type ProfileCacheEntry } from '$lib/nostr/profiles';
import { createMentionCandidates } from './mention-actions';

type FollowPubkeyLoader = (
	pubkey: string,
	relays: string[],
	signal: AbortSignal
) => Promise<string[]>;

type MentionCandidateControllerOptions = {
	getProfiles?: () => ProfileCacheEntry[];
	requestProfileMetadata?: (pubkeys: string[], relays: string[]) => void;
	getAccountReadRelays?: (pubkey: string) => Promise<string[]>;
	loadFollowPubkeys?: FollowPubkeyLoader;
	profileRelayUrls?: string[];
};

const followRequestTimeoutMs = 5_000;

function uniqueRelays(relays: string[]) {
	return [...new Set(relays)];
}

export function extractFollowPubkeys(tags: Nostr.Event['tags']) {
	const pubkeys: string[] = [];
	for (const tag of tags) {
		const pubkey = tag[0] === 'p' ? normalizePubkey(tag[1]) : null;
		if (pubkey && !pubkeys.includes(pubkey)) {
			pubkeys.push(pubkey);
		}
	}
	return pubkeys;
}

export function selectLatestFollowList(events: Nostr.Event[]) {
	return events.reduce<Nostr.Event | null>((latest, event) => {
		if (event.kind !== Contacts) {
			return latest;
		}
		if (
			!latest ||
			event.created_at > latest.created_at ||
			(event.created_at === latest.created_at && event.id < latest.id)
		) {
			return event;
		}
		return latest;
	}, null);
}

export function requestLatestFollowPubkeys(
	pubkey: string,
	relays: string[],
	signal: AbortSignal
): Promise<string[]> {
	return new Promise((resolve) => {
		const request = createRxBackwardReq();
		const events: Nostr.Event[] = [];
		let subscription: Unsubscribable | null = null;
		let timeoutId: ReturnType<typeof setTimeout> | null = null;
		let finished = false;
		const finish = () => {
			if (finished) {
				return;
			}
			finished = true;
			if (timeoutId) {
				clearTimeout(timeoutId);
			}
			signal.removeEventListener('abort', finish);
			subscription?.unsubscribe();
			const latest = selectLatestFollowList(events);
			resolve(latest ? extractFollowPubkeys(latest.tags) : []);
		};

		if (signal.aborted) {
			finish();
			return;
		}
		signal.addEventListener('abort', finish, { once: true });
		subscription = getNostrClient()
			.use(request)
			.subscribe({
				next: ({ event }) => {
					if (event.pubkey.toLowerCase() === pubkey) {
						events.push(event);
					}
				},
				error: finish,
				complete: finish
			});
		timeoutId = setTimeout(finish, followRequestTimeoutMs);
		request.emit({ kinds: [Contacts], authors: [pubkey], limit: 1 } as LazyFilter, { relays });
		request.over();
	});
}

export function createMentionCandidateController({
	getProfiles = listCachedProfiles,
	requestProfileMetadata = requestProfiles,
	getAccountReadRelays = getNip65ReadRelaysForPubkey,
	loadFollowPubkeys = requestLatestFollowPubkeys,
	profileRelayUrls = [...profileRelays]
}: MentionCandidateControllerOptions = {}) {
	let activePubkey = $state<string | null>(null);
	let followedPubkeys = $state<string[]>([]);
	let generation = 0;
	let abortController: AbortController | null = null;

	async function setAccount(pubkey: string | null) {
		const normalizedPubkey = normalizePubkey(pubkey);
		if (normalizedPubkey === activePubkey) {
			return;
		}

		generation += 1;
		const currentGeneration = generation;
		abortController?.abort();
		abortController = null;
		activePubkey = normalizedPubkey;
		followedPubkeys = [];
		if (!normalizedPubkey) {
			return;
		}

		const controller = new AbortController();
		abortController = controller;
		try {
			const accountReadRelays = await getAccountReadRelays(normalizedPubkey);
			if (controller.signal.aborted || generation !== currentGeneration) {
				return;
			}
			const relays = uniqueRelays([
				...(accountReadRelays.length > 0 ? accountReadRelays : [...defaultRelays]),
				...profileRelayUrls
			]);
			const nextFollowedPubkeys = await loadFollowPubkeys(
				normalizedPubkey,
				relays,
				controller.signal
			);
			if (controller.signal.aborted || generation !== currentGeneration) {
				return;
			}
			followedPubkeys = nextFollowedPubkeys;
			requestProfileMetadata(nextFollowedPubkeys, relays);
		} catch {
			if (generation === currentGeneration) {
				followedPubkeys = [];
			}
		}
	}

	function stop() {
		void setAccount(null);
	}

	return {
		get candidates() {
			return activePubkey ? createMentionCandidates(getProfiles(), followedPubkeys) : [];
		},
		setAccount,
		stop
	};
}
