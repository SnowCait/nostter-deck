import type * as Nostr from 'nostr-typedef';
import type { Post } from './types';
import { encodeEventPointer, encodeNeventPointer } from '$lib/nostr/nip19';

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

export function buildNip10ReplyTags(target: Nostr.Event, targetReadRelays: string[]) {
	const relayHint = targetReadRelays[0] ?? '';
	const targetEventTags = target.tags.filter((tag) => tag[0] === 'e' && tag[1]);
	const targetRootTag = targetEventTags.find((tag) => tag[3] === 'root');
	const hasMarkedEventTags = targetEventTags.some((tag) => tag[3] === 'root' || tag[3] === 'reply');
	const legacyRootTag = hasMarkedEventTags ? undefined : targetEventTags[0];
	const rootTag = targetRootTag ?? legacyRootTag;
	const rootId = rootTag?.[1] ?? target.id;
	const rootRelayHint = rootTag?.[2] ?? relayHint;
	const rootAuthorPubkey = getTagPubkeyHint(rootTag);
	const replyTag = ['e', target.id, relayHint, 'reply', target.pubkey];
	const eventTags =
		rootId === target.id
			? [['e', target.id, relayHint, 'root', target.pubkey]]
			: [createRootEventTag(rootId, rootRelayHint, rootAuthorPubkey), replyTag];

	return [...eventTags, ...getReplyPubkeyTags(target, relayHint)];
}

export function buildNip18QuoteRepost(
	content: string,
	target: Nostr.Event,
	targetReadRelays: string[]
) {
	const relayHint = targetReadRelays[0] ?? '';
	const encodedPointer = encodeNeventPointer(target, relayHint ? [relayHint] : []);
	const quoteReference = `nostr:${encodedPointer ?? target.id}`;

	return {
		content: `${content.trimEnd()}\n\n${quoteReference}`,
		tags: [['q', target.id, relayHint, target.pubkey]]
	};
}

function createRootEventTag(rootId: string, relayHint: string, rootAuthorPubkey: string | null) {
	const tag = ['e', rootId, relayHint, 'root'];
	return rootAuthorPubkey ? [...tag, rootAuthorPubkey] : tag;
}

function getTagPubkeyHint(tag: string[] | undefined) {
	const value = tag?.[4];
	return value && /^[0-9a-f]{64}$/i.test(value) ? value.toLowerCase() : null;
}

function getReplyPubkeyTags(target: Nostr.Event, relayHint: string) {
	const pubkeyTags = new Map<string, string>();
	pubkeyTags.set(target.pubkey.toLowerCase(), relayHint);

	for (const tag of target.tags) {
		const pubkey = tag[0] === 'p' && tag[1] && /^[0-9a-f]{64}$/i.test(tag[1]) ? tag[1] : null;
		if (!pubkey) {
			continue;
		}

		const normalizedPubkey = pubkey.toLowerCase();
		if (pubkeyTags.has(normalizedPubkey)) {
			continue;
		}
		pubkeyTags.set(normalizedPubkey, tag[2] ?? '');
	}

	return [...pubkeyTags].map(([pubkey, relay]) => (relay ? ['p', pubkey, relay] : ['p', pubkey]));
}
