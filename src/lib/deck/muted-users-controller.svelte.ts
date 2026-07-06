import {
	addMutedPubkey,
	readMutedPubkeys,
	removeMutedPubkey,
	writeMutedPubkeys
} from '$lib/muted-users';

export function createMutedUsersController() {
	let pubkeys = $state(readMutedPubkeys());

	function isMutedUser(pubkey: string) {
		return pubkeys.includes(pubkey);
	}

	function muteUser(pubkey: string) {
		pubkeys = addMutedPubkey(pubkeys, pubkey);
		writeMutedPubkeys(pubkeys);
	}

	function unmuteUser(pubkey: string) {
		pubkeys = removeMutedPubkey(pubkeys, pubkey);
		writeMutedPubkeys(pubkeys);
	}

	return {
		get pubkeys() {
			return pubkeys;
		},
		isMutedUser,
		muteUser,
		unmuteUser
	};
}
