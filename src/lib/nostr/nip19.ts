import { ChannelCreation } from 'nostr-tools/kinds';
import { decode, npubEncode } from 'nostr-tools/nip19';
import { normalizeRelay } from './relays';

export type ProfilePointer = {
	pubkey: string;
	relays: string[];
};

export type EventPointer = {
	id: string;
	relays: string[];
	author?: string;
	kind?: number;
};

export type ChannelPointer = {
	channelId: string;
	relays: string[];
};

const eventIdPattern = /^[0-9a-f]{64}$/i;

export function decodeProfilePointer(value: string): ProfilePointer | null {
	try {
		const decoded = decode(value.trim());

		if (decoded.type === 'npub') {
			return {
				pubkey: decoded.data,
				relays: []
			};
		}

		if (decoded.type === 'nprofile') {
			return {
				pubkey: decoded.data.pubkey,
				relays: decoded.data.relays?.map(normalizeRelay).filter((relay) => relay !== null) ?? []
			};
		}

		return null;
	} catch {
		return null;
	}
}

export function decodeEventPointer(value: string): EventPointer | null {
	const trimmedValue = value.trim();
	if (eventIdPattern.test(trimmedValue)) {
		return {
			id: trimmedValue.toLowerCase(),
			relays: []
		};
	}

	try {
		const decoded = decode(trimmedValue);
		if (decoded.type !== 'nevent') return null;

		return {
			id: decoded.data.id.toLowerCase(),
			relays: decoded.data.relays?.map(normalizeRelay).filter((relay) => relay !== null) ?? [],
			...(decoded.data.author ? { author: decoded.data.author.toLowerCase() } : {}),
			...(typeof decoded.data.kind === 'number' ? { kind: decoded.data.kind } : {})
		};
	} catch {
		return null;
	}
}

export function decodeChannelPointer(value: string): ChannelPointer | null {
	const pointer = decodeEventPointer(value);
	if (!pointer) return null;
	if (pointer.kind !== undefined && pointer.kind !== ChannelCreation) return null;

	return {
		channelId: pointer.id,
		relays: pointer.relays
	};
}

export function encodeNpub(pubkey: string) {
	return npubEncode(pubkey);
}
