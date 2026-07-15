import { isAddressableKind, isReplaceableKind } from 'nostr-tools/kinds';
import type * as Nostr from 'nostr-typedef';
import { normalizePubkey } from './pubkeys';

export type LatestEventKey = [pubkey: string, kind: number, identifier: string];

export type LatestEventCandidate = {
	key: LatestEventKey;
	pubkey: string;
	kind: number;
	identifier: string;
	event: Nostr.Event;
};

export function isSupportedLatestEventKind(kind: number) {
	if (!Number.isInteger(kind) || kind < 0 || kind > 65535) {
		return false;
	}

	return isReplaceableKind(kind) || isAddressableKind(kind);
}

export function getLatestEventIdentifier(event: Nostr.Event) {
	if (isReplaceableKind(event.kind)) {
		return '';
	}

	if (!isAddressableKind(event.kind)) {
		throw new Error(`Unsupported latest event kind: ${event.kind}`);
	}

	const identifierTag = event.tags.find((tag) => tag[0] === 'd' && typeof tag[1] === 'string');
	if (!identifierTag) {
		throw new Error(`Addressable event kind ${event.kind} is missing a usable d tag`);
	}

	return identifierTag[1];
}

export function getLatestEventKey(event: Nostr.Event): LatestEventKey {
	if (!isSupportedLatestEventKind(event.kind)) {
		throw new Error(`Unsupported latest event kind: ${event.kind}`);
	}

	const pubkey = normalizePubkey(event.pubkey);
	if (!pubkey) {
		throw new Error(`Invalid latest event pubkey: ${event.pubkey}`);
	}

	return [pubkey, event.kind, getLatestEventIdentifier(event)];
}

export function toLatestEventCandidate(event: Nostr.Event): LatestEventCandidate {
	const [pubkey, kind, identifier] = getLatestEventKey(event);

	return {
		key: [pubkey, kind, identifier],
		pubkey,
		kind,
		identifier,
		event
	};
}

export function isNewerLatestEvent(incoming: Nostr.Event, current: Nostr.Event) {
	if (incoming.id === current.id) {
		return false;
	}

	if (incoming.created_at !== current.created_at) {
		return incoming.created_at > current.created_at;
	}

	return incoming.id < current.id;
}

export function reduceLatestEvents(events: Nostr.Event[]): LatestEventCandidate[] {
	const winners = new Map<string, LatestEventCandidate>();

	for (const event of events) {
		const candidate = toLatestEventCandidate(event);
		const serializedKey = JSON.stringify(candidate.key);
		const current = winners.get(serializedKey);

		if (!current || isNewerLatestEvent(candidate.event, current.event)) {
			winners.set(serializedKey, candidate);
		}
	}

	return [...winners.values()];
}
