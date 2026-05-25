import { decode, npubEncode } from 'nostr-tools/nip19';
import { normalizeRelay } from './relays';

export type ProfilePointer = {
	pubkey: string;
	relays: string[];
};

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

export function encodeNpub(pubkey: string) {
	return npubEncode(pubkey);
}
