import type { LikeReaction } from '$lib/nostr/emoji-reactions';

export type LikeReactionIcon = 'heart' | 'paw' | 'star';

export function getLikeReactionIcon(reaction: LikeReaction): LikeReactionIcon {
	if (reaction.type !== 'unicode') {
		return 'heart';
	}

	if (reaction.emoji === '🐾') {
		return 'paw';
	}

	if (reaction.emoji.replace(/\ufe0f/g, '') === '⭐') {
		return 'star';
	}

	return 'heart';
}
