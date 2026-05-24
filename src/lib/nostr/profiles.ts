import { createRxBackwardReq, latestEach, uniq, type LazyFilter } from 'rx-nostr';
import type * as Nostr from 'nostr-typedef';
import type { Unsubscribable } from 'rxjs';
import { getNostrClient } from './client';

type ProfileListener = () => void;

const profilesByPubkey = new Map<string, Nostr.Content.Metadata>();
const requestedPubkeys = new Set<string>();
const listeners = new Set<ProfileListener>();

let profileReq: ReturnType<typeof createRxBackwardReq> | null = null;
let profileSubscription: Unsubscribable | null = null;

function ensureProfileReq() {
	if (profileReq) return profileReq;

	profileReq = createRxBackwardReq();
	profileSubscription = getNostrClient()
		.use(profileReq)
		.pipe(
			uniq(),
			latestEach(({ event }) => event.pubkey)
		)
		.subscribe(({ event }) => {
			const profile = parseProfile(event.content);
			if (!profile) return;

			profilesByPubkey.set(event.pubkey, profile);
			for (const listener of listeners) {
				listener();
			}
		});

	return profileReq;
}

export function requestProfiles(pubkeys: string[], relays: string[]) {
	const nextPubkeys: string[] = [];
	for (const pubkey of pubkeys) {
		if (requestedPubkeys.has(pubkey) || profilesByPubkey.has(pubkey)) continue;

		requestedPubkeys.add(pubkey);
		nextPubkeys.push(pubkey);
	}

	if (nextPubkeys.length === 0) return;

	ensureProfileReq().emit(
		{
			kinds: [0],
			authors: nextPubkeys
		} as LazyFilter,
		{ relays }
	);
}

export function getProfile(pubkey: string) {
	return profilesByPubkey.get(pubkey);
}

export function subscribeProfiles(listener: ProfileListener): Unsubscribable {
	listeners.add(listener);

	return {
		unsubscribe() {
			listeners.delete(listener);
		}
	};
}

export function disposeProfileCache() {
	profileSubscription?.unsubscribe();
	profileReq = null;
	profileSubscription = null;
	profilesByPubkey.clear();
	requestedPubkeys.clear();
	listeners.clear();
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
