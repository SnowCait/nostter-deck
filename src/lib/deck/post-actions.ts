import type * as Nostr from 'nostr-typedef';
import type { Post } from './types';
import { encodeEventPointer } from '$lib/nostr/nip19';

const postShareUrlBase = 'https://nostter.app/';

export function getPostLikeTarget(post: Post): Nostr.Event | null {
	if (post.referenceType) {
		return post.events.referenced ?? null;
	}
	return post.events.source;
}

export function getPostRepostTarget(post: Post): Nostr.Event | null {
	if (post.referenceType) {
		return post.events.referenced ?? null;
	}
	return post.events.source;
}

export function getPostReplyTarget(post: Post): Nostr.Event | null {
	if (post.referenceType) {
		return post.events.referenced ?? null;
	}
	return post.events.source;
}

export function getPostQuoteTarget(post: Post): Nostr.Event | null {
	if (post.referenceType) {
		return post.events.referenced ?? null;
	}
	return post.events.source;
}

export function getPostShareTarget(post: Post): Nostr.Event | null {
	if (post.referenceType) {
		return post.events.referenced ?? null;
	}
	return post.events.source;
}

export function buildPostShareUrl(post: Post): string | null {
	const target = getPostShareTarget(post);
	if (!target) {
		return null;
	}

	const pointer = encodeEventPointer(target);
	return pointer ? `${postShareUrlBase}${pointer.value}` : null;
}
