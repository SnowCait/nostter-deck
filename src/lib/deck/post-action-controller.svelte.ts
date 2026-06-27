import { SvelteSet } from 'svelte/reactivity';
import type { Post } from './types';
import { getPostLikeTarget } from './post-actions';
import type { Nip07Signer } from '$lib/nostr/auth.svelte';
import type { EmojiReaction } from '$lib/nostr/emoji-reactions';
import { getNip65ReadRelaysForPubkey } from '$lib/nostr/nip65';
import {
	publishEmojiReaction,
	publishLikeReaction,
	type PublishPostResult
} from '$lib/nostr/publish';

type PostActionControllerOptions = {
	getAccountPubkey: () => string | null;
	getSigner: () => Nip07Signer | null;
	getIncludeClientTag: () => boolean;
	getTargetReadRelays?: (pubkey: string) => Promise<string[]>;
};

export type LikePostResult =
	| PublishPostResult
	| { ok: false; reason: 'no-target' | 'unauthenticated' | 'already-liked' | 'already-publishing' };

export type EmojiReactionResult =
	| PublishPostResult
	| { ok: false; reason: 'no-target' | 'unauthenticated' | 'already-publishing' };

export function createPostActionController({
	getAccountPubkey,
	getSigner,
	getIncludeClientTag,
	getTargetReadRelays = getNip65ReadRelaysForPubkey
}: PostActionControllerOptions) {
	const likedTargetEventIds = new SvelteSet<string>();
	const publishingLikeTargetEventIds = new SvelteSet<string>();
	const publishingEmojiReactionKeys = new SvelteSet<string>();
	const publishingEmojiTargetEventIds = new SvelteSet<string>();

	function getLikeTargetId(post: Post) {
		return getPostLikeTarget(post)?.id ?? null;
	}

	function isLiked(post: Post) {
		const targetId = getLikeTargetId(post);
		return Boolean(targetId && likedTargetEventIds.has(targetId));
	}

	function isLiking(post: Post) {
		const targetId = getLikeTargetId(post);
		return Boolean(targetId && publishingLikeTargetEventIds.has(targetId));
	}

	function canLike(post: Post) {
		return Boolean(
			getLikeTargetId(post) &&
			getAccountPubkey() &&
			getSigner() &&
			!isLiked(post) &&
			!isLiking(post)
		);
	}

	function canReactWithEmoji(post: Post) {
		return Boolean(getLikeTargetId(post) && getAccountPubkey() && getSigner());
	}

	function getEmojiReactionKey(post: Post, reaction: EmojiReaction) {
		const targetId = getLikeTargetId(post);
		if (!targetId) return null;

		const reactionKey =
			reaction.type === 'unicode'
				? `unicode:${reaction.emoji}`
				: `custom:${reaction.url}:${reaction.shortcode}:${reaction.address ?? ''}`;
		return `${targetId}:${reactionKey}`;
	}

	function isReactingWithEmoji(post: Post) {
		const targetId = getLikeTargetId(post);
		return Boolean(targetId && publishingEmojiTargetEventIds.has(targetId));
	}

	async function likePost(post: Post): Promise<LikePostResult> {
		const target = getPostLikeTarget(post);
		if (!target) return { ok: false, reason: 'no-target' };

		const pubkey = getAccountPubkey();
		const signer = getSigner();
		if (!pubkey || !signer) return { ok: false, reason: 'unauthenticated' };
		if (isLiked(post)) return { ok: false, reason: 'already-liked' };
		if (isLiking(post)) return { ok: false, reason: 'already-publishing' };

		publishingLikeTargetEventIds.add(target.id);
		try {
			const targetReadRelays = await getTargetReadRelays(target.pubkey);
			const result = await publishLikeReaction(target, pubkey, signer, targetReadRelays, {
				includeClientTag: getIncludeClientTag()
			});
			if (result.ok) likedTargetEventIds.add(target.id);
			return result;
		} finally {
			publishingLikeTargetEventIds.delete(target.id);
		}
	}

	async function reactWithEmoji(post: Post, reaction: EmojiReaction): Promise<EmojiReactionResult> {
		const target = getPostLikeTarget(post);
		if (!target) return { ok: false, reason: 'no-target' };

		const pubkey = getAccountPubkey();
		const signer = getSigner();
		if (!pubkey || !signer) return { ok: false, reason: 'unauthenticated' };

		const reactionKey = getEmojiReactionKey(post, reaction);
		if (!reactionKey) return { ok: false, reason: 'no-target' };
		if (publishingEmojiReactionKeys.has(reactionKey))
			return { ok: false, reason: 'already-publishing' };

		publishingEmojiReactionKeys.add(reactionKey);
		publishingEmojiTargetEventIds.add(target.id);
		try {
			const targetReadRelays = await getTargetReadRelays(target.pubkey);
			return await publishEmojiReaction(target, reaction, pubkey, signer, targetReadRelays, {
				includeClientTag: getIncludeClientTag()
			});
		} finally {
			publishingEmojiReactionKeys.delete(reactionKey);
			if (![...publishingEmojiReactionKeys].some((key) => key.startsWith(`${target.id}:`))) {
				publishingEmojiTargetEventIds.delete(target.id);
			}
		}
	}

	return {
		canLike,
		isLiked,
		isLiking,
		likePost,
		canReactWithEmoji,
		isReactingWithEmoji,
		reactWithEmoji
	};
}
