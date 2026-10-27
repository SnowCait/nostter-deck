import { normalizePubkey } from '$lib/nostr/pubkeys';

export function normalizeMutedPubkeys(value: unknown): string[] {
	if (!Array.isArray(value)) {
		return [];
	}

	return [
		...new Set(
			value.flatMap((pubkey) => {
				const normalizedPubkey = normalizePubkey(pubkey);
				return normalizedPubkey ? [normalizedPubkey] : [];
			})
		)
	];
}

export function addMutedPubkey(pubkeys: string[], pubkey: string) {
	return normalizeMutedPubkeys([...pubkeys, pubkey]);
}

export function removeMutedPubkey(pubkeys: string[], pubkey: string) {
	const normalizedPubkey = normalizePubkey(pubkey);
	if (!normalizedPubkey) {
		return normalizeMutedPubkeys(pubkeys);
	}
	return normalizeMutedPubkeys(pubkeys).filter((candidate) => candidate !== normalizedPubkey);
}
