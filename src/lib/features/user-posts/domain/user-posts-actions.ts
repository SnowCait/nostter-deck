import { Repost, ShortTextNote } from 'nostr-tools/kinds';
import type * as Nostr from 'nostr-typedef';
import { decodeProfilePointer } from '$lib/nostr/nip19';
import { isShortTextNoteReplyEvent } from '$lib/nostr/posts';
import { normalizePubkey } from '$lib/nostr/pubkeys';
import type { RelaySelection } from '$lib/nostr/relays';

export type UserPostsSettings = {
	pubkey: string;
	relays: RelaySelection;
	includeReplies: boolean;
	includeReposts: boolean;
};

export type UserPostsDraft = Omit<UserPostsSettings, 'pubkey' | 'relays'> & {
	target: string;
	relays: RelaySelection | null;
};

export function parseUserPostsTarget(input: string) {
	return normalizePubkey(input.trim()) ?? normalizePubkey(decodeProfilePointer(input)?.pubkey);
}

export function resolveUserPostsSettings(draft: UserPostsDraft): UserPostsSettings | null {
	const pubkey = parseUserPostsTarget(draft.target);
	if (!pubkey || !draft.relays) {
		return null;
	}

	return {
		pubkey,
		relays: draft.relays.type === 'nip65' ? { type: 'nip65', pubkey } : draft.relays,
		includeReplies: draft.includeReplies,
		includeReposts: draft.includeReposts
	};
}

export function isVisibleUserPost(
	event: Nostr.Event,
	{ pubkey, includeReplies, includeReposts }: UserPostsSettings
) {
	if (event.pubkey !== pubkey) {
		return false;
	}
	if (event.kind === Repost) {
		return includeReposts;
	}
	return event.kind === ShortTextNote && (includeReplies || !isShortTextNoteReplyEvent(event));
}
