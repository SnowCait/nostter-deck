import type { CustomEmojiReactionCandidate } from '$lib/nostr/emoji-reactions';
import { loadUserEmojiReactionCandidates } from '$lib/nostr/emoji-reactions';
import { getNip65ReadRelaysForPubkey } from '$lib/nostr/nip65';
import { combineRelays, defaultRelays } from '$lib/nostr/relays';

type EmojiReactionControllerOptions = {
	getAccountPubkey: () => string | null;
	getReadRelays?: (pubkey: string) => Promise<string[]>;
	loadCandidates?: (pubkey: string, relays: string[]) => Promise<CustomEmojiReactionCandidate[]>;
};

export function createEmojiReactionController({
	getAccountPubkey,
	getReadRelays = getNip65ReadRelaysForPubkey,
	loadCandidates = loadUserEmojiReactionCandidates
}: EmojiReactionControllerOptions) {
	let candidates = $state<CustomEmojiReactionCandidate[]>([]);
	let isLoading = $state(false);
	let requestId = 0;

	$effect(() => {
		const pubkey = getAccountPubkey();
		const currentRequestId = ++requestId;
		if (!pubkey) {
			candidates = [];
			isLoading = false;
			return;
		}

		isLoading = true;
		void (async () => {
			try {
				const relays = combineRelays(await getReadRelays(pubkey), [...defaultRelays]);
				const nextCandidates = await loadCandidates(pubkey, relays);
				if (requestId === currentRequestId) candidates = nextCandidates;
			} catch {
				if (requestId === currentRequestId) candidates = [];
			} finally {
				if (requestId === currentRequestId) isLoading = false;
			}
		})();
	});

	return {
		get candidates() {
			return candidates;
		},
		get isLoading() {
			return isLoading;
		}
	};
}
