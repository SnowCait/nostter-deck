import { SvelteSet } from 'svelte/reactivity';
import type { Post } from './types';
import { getPostLikeTarget } from './post-actions';
import type { Nip07Signer } from '$lib/nostr/auth.svelte';
import { getNip65ReadRelaysForPubkey } from '$lib/nostr/nip65';
import { publishLikeReaction, type PublishPostResult } from '$lib/nostr/publish';

type PostActionControllerOptions = {
	getAccountPubkey: () => string | null;
	getSigner: () => Nip07Signer | null;
	getIncludeClientTag: () => boolean;
	getTargetReadRelays?: (pubkey: string) => Promise<string[]>;
};

export type LikePostResult =
	| PublishPostResult
	| { ok: false; reason: 'no-target' | 'unauthenticated' | 'already-liked' | 'already-publishing' };

export function createPostActionController({
	getAccountPubkey,
	getSigner,
	getIncludeClientTag,
	getTargetReadRelays = getNip65ReadRelaysForPubkey
}: PostActionControllerOptions) {
	const likedTargetEventIds = new SvelteSet<string>();
	const publishingLikeTargetEventIds = new SvelteSet<string>();

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

	return {
		canLike,
		isLiked,
		isLiking,
		likePost
	};
}
