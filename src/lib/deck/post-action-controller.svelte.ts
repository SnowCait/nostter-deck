import { SvelteSet } from 'svelte/reactivity';
import { ShortTextNote } from 'nostr-tools/kinds';
import type { EventSigner } from 'rx-nostr';
import type { Post } from './types';
import { getPostLikeTarget, getPostRepostTarget } from './post-actions';
import type { EmojiReaction } from '$lib/nostr/emoji-reactions';
import { getNip65ReadRelaysForPubkey } from '$lib/nostr/nip65';
import {
	publishEmojiReaction,
	publishLikeReaction,
	publishRepost,
	type PublishPostResult
} from '$lib/nostr/publish';

type PostActionControllerOptions = {
	getAccountPubkey: () => string | null;
	getSigner: () => EventSigner | null;
	getIncludeClientTag: () => boolean;
	getTargetReadRelays?: (pubkey: string) => Promise<string[]>;
};

export type LikePostResult =
	| PublishPostResult
	| { ok: false; reason: 'no-target' | 'unauthenticated' | 'already-liked' | 'already-publishing' };

export type EmojiReactionResult =
	| PublishPostResult
	| { ok: false; reason: 'no-target' | 'unauthenticated' | 'already-publishing' };

export type RepostResult =
	| PublishPostResult
	| {
			ok: false;
			reason:
				| 'no-target'
				| 'unsupported-kind'
				| 'unauthenticated'
				| 'already-reposted'
				| 'already-publishing';
	  };

export function createPostActionController({
	getAccountPubkey,
	getSigner,
	getIncludeClientTag,
	getTargetReadRelays = getNip65ReadRelaysForPubkey
}: PostActionControllerOptions) {
	const likedTargetEventIds = new SvelteSet<string>();
	const repostedTargetEventIds = new SvelteSet<string>();
	const publishingLikeTargetEventIds = new SvelteSet<string>();
	const publishingRepostTargetEventIds = new SvelteSet<string>();
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

	function getRepostTargetId(post: Post) {
		return getPostRepostTarget(post)?.id ?? null;
	}

	function isReposted(post: Post) {
		const targetId = getRepostTargetId(post);
		return Boolean(targetId && repostedTargetEventIds.has(targetId));
	}

	function isReposting(post: Post) {
		const targetId = getRepostTargetId(post);
		return Boolean(targetId && publishingRepostTargetEventIds.has(targetId));
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

	function canRepost(post: Post) {
		const target = getPostRepostTarget(post);
		return Boolean(
			target?.kind === ShortTextNote &&
			getAccountPubkey() &&
			getSigner() &&
			!isReposted(post) &&
			!isReposting(post)
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

	async function repostPost(post: Post): Promise<RepostResult> {
		const target = getPostRepostTarget(post);
		if (!target) return { ok: false, reason: 'no-target' };
		if (target.kind !== ShortTextNote) return { ok: false, reason: 'unsupported-kind' };

		const pubkey = getAccountPubkey();
		const signer = getSigner();
		if (!pubkey || !signer) return { ok: false, reason: 'unauthenticated' };
		if (isReposted(post)) return { ok: false, reason: 'already-reposted' };
		if (isReposting(post)) return { ok: false, reason: 'already-publishing' };

		publishingRepostTargetEventIds.add(target.id);
		try {
			const result = await publishRepost(target, pubkey, signer, {
				includeClientTag: getIncludeClientTag()
			});
			if (result.ok) repostedTargetEventIds.add(target.id);
			return result;
		} finally {
			publishingRepostTargetEventIds.delete(target.id);
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
		canRepost,
		isReposted,
		isReposting,
		repostPost,
		canReactWithEmoji,
		isReactingWithEmoji,
		reactWithEmoji
	};
}
