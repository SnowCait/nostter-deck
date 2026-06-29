import type * as Nostr from 'nostr-typedef';
import type { Post } from './types';

export function getPostLikeTarget(post: Post): Nostr.Event | null {
	if (post.referenceType) return post.events.referenced ?? null;
	return post.events.source;
}

export function getPostRepostTarget(post: Post): Nostr.Event | null {
	if (post.referenceType) return post.events.referenced ?? null;
	return post.events.source;
}
