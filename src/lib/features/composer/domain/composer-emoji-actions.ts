import type {
	CustomEmojiDefinition,
	CustomEmojiReaction,
	EmojiReaction
} from '$lib/nostr/emoji-reactions';

export type ComposerCustomEmoji = CustomEmojiDefinition & {
	sourceShortcode: string;
};

export type ComposerEmojiSelection = {
	insertion: string;
	customEmojis: ComposerCustomEmoji[];
};

export function applyComposerEmojiSelection(
	customEmojis: ComposerCustomEmoji[],
	reaction: EmojiReaction
): ComposerEmojiSelection {
	if (reaction.type === 'unicode') {
		return { insertion: reaction.emoji, customEmojis };
	}

	const existing = customEmojis.find((emoji) => isSameCustomEmoji(emoji, reaction));
	if (existing) {
		return { insertion: `:${existing.shortcode}:`, customEmojis };
	}

	const usedShortcodes = new Set(customEmojis.map((emoji) => emoji.shortcode));
	let shortcode = reaction.shortcode;
	let suffix = 2;
	while (usedShortcodes.has(shortcode)) {
		shortcode = `${reaction.shortcode}_${suffix}`;
		suffix += 1;
	}

	return {
		insertion: `:${shortcode}:`,
		customEmojis: [
			...customEmojis,
			{
				shortcode,
				sourceShortcode: reaction.shortcode,
				url: reaction.url,
				...(reaction.address ? { address: reaction.address } : {})
			}
		]
	};
}

function isSameCustomEmoji(emoji: ComposerCustomEmoji, reaction: CustomEmojiReaction) {
	return (
		emoji.sourceShortcode === reaction.shortcode &&
		emoji.url === reaction.url &&
		(emoji.address ?? null) === (reaction.address ?? null)
	);
}
