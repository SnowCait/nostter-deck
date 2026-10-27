import { persistedState } from 'svelte-persisted-state';
import { normalizeMutedPubkeys } from '../domain/muted-users';

const mutedUsersStorageKey = 'nostter:muted-users';

const mutedPubkeysState = persistedState<string[]>(mutedUsersStorageKey, [], {
	beforeRead: normalizeMutedPubkeys
});

export function readMutedPubkeys() {
	return mutedPubkeysState.current;
}

export function writeMutedPubkeys(pubkeys: string[]) {
	mutedPubkeysState.current = normalizeMutedPubkeys(pubkeys);
}

export { mutedUsersStorageKey };
