import {
	addMutedPubkey,
	readMutedPubkeys,
	removeMutedPubkey,
	writeMutedPubkeys
} from '$lib/muted-users';

export function createMutedUsersController() {
	function isMutedUser(pubkey: string) {
		return readMutedPubkeys().includes(pubkey);
	}

	function muteUser(pubkey: string) {
		writeMutedPubkeys(addMutedPubkey(readMutedPubkeys(), pubkey));
	}

	function unmuteUser(pubkey: string) {
		writeMutedPubkeys(removeMutedPubkey(readMutedPubkeys(), pubkey));
	}

	return {
		get pubkeys() {
			return readMutedPubkeys();
		},
		isMutedUser,
		muteUser,
		unmuteUser
	};
}
