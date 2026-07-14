import { persistedState } from 'svelte-persisted-state';
import { normalizePubkey } from '$lib/nostr/pubkeys';

const mutedUsersStorageKey = 'nostter:muted-users';

const mutedPubkeysState = persistedState<string[]>(mutedUsersStorageKey, [], {
	beforeRead: normalizeMutedPubkeys
});

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

export function readMutedPubkeys() {
	return mutedPubkeysState.current;
}

export function writeMutedPubkeys(pubkeys: string[]) {
	mutedPubkeysState.current = normalizeMutedPubkeys(pubkeys);
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

export { mutedUsersStorageKey };
