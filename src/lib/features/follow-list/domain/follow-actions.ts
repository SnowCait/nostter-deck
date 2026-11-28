import type * as Nostr from 'nostr-typedef';
import { Contacts } from 'nostr-tools/kinds';

export type FollowListUpdate = Pick<Nostr.Event<typeof Contacts>, 'kind' | 'content' | 'tags'>;

export function addFollow(
	event: FollowListUpdate | undefined,
	pubkey: string
): FollowListUpdate | null {
	const tags = event?.tags ?? [];
	if (tags.some((tag) => tag[0] === 'p' && tag[1] === pubkey)) {
		return null;
	}

	return {
		kind: Contacts,
		content: event?.content ?? '',
		tags: [...tags, ['p', pubkey, '']]
	};
}

export function removeFollow(
	event: FollowListUpdate | undefined,
	pubkey: string
): FollowListUpdate | null {
	if (!event) {
		return null;
	}

	const tags = event.tags.filter((tag) => !(tag[0] === 'p' && tag[1] === pubkey));
	if (tags.length === event.tags.length) {
		return null;
	}

	return { kind: Contacts, content: event.content, tags };
}
