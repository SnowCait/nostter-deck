import { readJsonStorage, writeJsonStorage } from '$lib/local-storage';

const mutedUsersStorageKey = 'nostter:muted-users';
const pubkeyPattern = /^[0-9a-f]{64}$/i;

export function normalizeMutedPubkeys(value: unknown): string[] {
	if (!Array.isArray(value)) return [];

	return [
		...new Set(
			value.flatMap((pubkey) =>
				typeof pubkey === 'string' && pubkeyPattern.test(pubkey) ? [pubkey.toLowerCase()] : []
			)
		)
	];
}

export function readMutedPubkeys() {
	return readJsonStorage(mutedUsersStorageKey, [], normalizeMutedPubkeys);
}

export function writeMutedPubkeys(pubkeys: string[]) {
	writeJsonStorage(mutedUsersStorageKey, pubkeys, normalizeMutedPubkeys);
}

export function addMutedPubkey(pubkeys: string[], pubkey: string) {
	return normalizeMutedPubkeys([...pubkeys, pubkey]);
}

export function removeMutedPubkey(pubkeys: string[], pubkey: string) {
	const normalizedPubkey = pubkey.toLowerCase();
	return normalizeMutedPubkeys(pubkeys).filter((candidate) => candidate !== normalizedPubkey);
}

export { mutedUsersStorageKey };
