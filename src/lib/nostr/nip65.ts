import { createRxBackwardReq, type LazyFilter } from 'rx-nostr';
import type * as Nostr from 'nostr-typedef';
import { RelayList } from 'nostr-tools/kinds';
import { readJsonStorage, writeJsonStorage } from '$lib/local-storage';
import { getNostrClient } from './client';
import { defaultRelays, indexerRelays, normalizeRelay } from './relays';

export type Nip65RelayTag = ['r', string] | ['r', string, 'read' | 'write'];

type Nip65CacheEntry = {
	updatedAt: number;
	relayTags: Nip65RelayTag[];
};

type Nip65Cache = Record<string, Nip65CacheEntry>;

export const nip65CacheStorageKey = 'nostter:nip65-relays';
const nip65RequestTimeoutMs = 5_000;

function isPubkey(value: unknown): value is string {
	return typeof value === 'string' && /^[0-9a-f]{64}$/i.test(value);
}

export function extractNip65RelayTags(tags: Nostr.Event['tags']): Nip65RelayTag[] {
	const relayTags: Nip65RelayTag[] = [];
	for (const tag of tags) {
		if (tag[0] !== 'r' || typeof tag[1] !== 'string') continue;

		const marker = tag[2];
		if (
			!normalizeRelay(tag[1]) ||
			(marker !== undefined && marker !== 'read' && marker !== 'write')
		)
			continue;

		relayTags.push(marker ? ['r', tag[1], marker] : ['r', tag[1]]);
	}
	return relayTags;
}

export function hasNip65WriteRelay(relayTags: Nip65RelayTag[]) {
	return relayTags.some((tag) => tag[2] === undefined || tag[2] === 'write');
}

function normalizeNip65Cache(value: unknown): Nip65Cache {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return {};

	const entries: Nip65Cache = {};
	for (const [pubkey, entry] of Object.entries(value)) {
		if (!isPubkey(pubkey) || !entry || typeof entry !== 'object') continue;
		const candidate = entry as Partial<Nip65CacheEntry>;
		const updatedAt = candidate.updatedAt;
		if (
			typeof updatedAt !== 'number' ||
			!Number.isFinite(updatedAt) ||
			!Array.isArray(candidate.relayTags)
		)
			continue;

		entries[pubkey.toLowerCase()] = {
			updatedAt,
			relayTags: extractNip65RelayTags(candidate.relayTags)
		};
	}
	return entries;
}

function readNip65Cache() {
	return readJsonStorage<Nip65Cache>(nip65CacheStorageKey, {}, normalizeNip65Cache);
}

function writeNip65Cache(cache: Nip65Cache) {
	writeJsonStorage(nip65CacheStorageKey, cache, normalizeNip65Cache);
}

export function getCachedNip65RelayTags(pubkey: string) {
	return readNip65Cache()[pubkey.toLowerCase()]?.relayTags ?? [];
}

export function configureDefaultRelays(relayTags: Nip65RelayTag[]) {
	getNostrClient().setDefaultRelays(hasNip65WriteRelay(relayTags) ? relayTags : [...defaultRelays]);
}

export function configureCachedNip65Relays(pubkey: string) {
	configureDefaultRelays(getCachedNip65RelayTags(pubkey));
}

export function clearDefaultRelays() {
	getNostrClient().setDefaultRelays([]);
}

export async function refreshNip65Relays(pubkey: string) {
	const relayTags = await requestNip65RelayTags(pubkey);
	if (relayTags === null) return null;

	const cache = readNip65Cache();
	cache[pubkey.toLowerCase()] = { updatedAt: Date.now(), relayTags };
	writeNip65Cache(cache);
	return relayTags;
}

function requestNip65RelayTags(pubkey: string): Promise<Nip65RelayTag[] | null> {
	return new Promise((resolve) => {
		const request = createRxBackwardReq();
		let latestEvent: Nostr.Event | null = null;
		let finished = false;
		const finish = (value: Nip65RelayTag[] | null) => {
			if (finished) return;
			finished = true;
			clearTimeout(timeoutId);
			subscription.unsubscribe();
			resolve(value);
		};
		const subscription = getNostrClient()
			.use(request)
			.subscribe({
				next: ({ event }) => {
					if (event.kind !== RelayList || event.pubkey.toLowerCase() !== pubkey.toLowerCase()) return;
					if (
						!latestEvent ||
						event.created_at > latestEvent.created_at ||
						(event.created_at === latestEvent.created_at && event.id > latestEvent.id)
					) {
						latestEvent = event;
					}
				},
				complete: () => finish(latestEvent ? extractNip65RelayTags(latestEvent.tags) : [])
			});
		const timeoutId = setTimeout(() => finish(null), nip65RequestTimeoutMs);

		request.emit({ kinds: [RelayList], authors: [pubkey], limit: 1 } as LazyFilter, {
			relays: [...indexerRelays]
		});
		request.over();
	});
}
