import { createRxBackwardReq, latestEach, uniq, type LazyFilter, type ReqPacket } from 'rx-nostr';
import type * as Nostr from 'nostr-typedef';
import { bufferTime, from, mergeMap, type Unsubscribable } from 'rxjs';
import { SvelteMap } from 'svelte/reactivity';
import { getNostrClient } from './client';

const profilesByPubkey = new SvelteMap<string, Nostr.Content.Metadata>();
const requestedPubkeys = new Set<string>();
const profileRequestBufferMs = 1000;

let profileReq: ReturnType<typeof createRxBackwardReq> | null = null;
let profileSubscription: Unsubscribable | null = null;

function ensureProfileReq() {
	if (profileReq) return profileReq;

	profileReq = createRxBackwardReq();
	const batchedProfileReq = profileReq.pipe(
		bufferTime(profileRequestBufferMs),
		mergeMap(mergeProfileReqPackets)
	);
	profileSubscription = getNostrClient()
		.use(batchedProfileReq)
		.pipe(
			uniq(),
			latestEach(({ event }) => event.pubkey)
		)
		.subscribe(({ event }) => {
			const profile = parseProfile(event.content);
			if (!profile) return;

			profilesByPubkey.set(event.pubkey, profile);
		});

	return profileReq;
}

function mergeProfileReqPackets(packets: ReqPacket[]) {
	const packetsByRelaySignature = new Map<string, ReqPacket>();

	for (const packet of packets) {
		if (packet.filters.length === 0) continue;

		const relays = packet.relays ? [...packet.relays].sort() : [];
		const relaySignature = JSON.stringify(relays);
		const currentPacket = packetsByRelaySignature.get(relaySignature);
		const authors = new Set<string>(
			currentPacket?.filters.flatMap((filter) => filter.authors ?? []) ?? []
		);

		for (const filter of packet.filters) {
			for (const author of filter.authors ?? []) {
				authors.add(author);
			}
		}

		if (authors.size === 0) continue;

		packetsByRelaySignature.set(relaySignature, {
			filters: [
				{
					kinds: [0],
					authors: [...authors]
				}
			],
			...(packet.relays ? { relays } : {})
		});
	}

	return from(packetsByRelaySignature.values());
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

export function disposeProfileCache() {
	profileSubscription?.unsubscribe();
	profileReq = null;
	profileSubscription = null;
	profilesByPubkey.clear();
	requestedPubkeys.clear();
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
