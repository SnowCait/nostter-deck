import type * as Nostr from 'nostr-typedef';

export type CustomEmoji = {
	shortcode: string;
	url: string;
};

export type CustomEmojiTextToken =
	| { type: 'text'; text: string }
	| { type: 'customEmoji'; text: string; shortcode: string; url: string };

const shortcodePattern = /^[A-Za-z0-9_-]+$/;
const shortcodeCandidatePattern = /:([A-Za-z0-9_-]+):/g;

export function parseCustomEmojis(tags: Nostr.Event['tags']): CustomEmoji[] {
	const emojisByShortcode = new Map<string, CustomEmoji>();

	for (const tag of tags) {
		if (tag[0] !== 'emoji' || !tag[1] || !tag[2]) continue;
		if (!shortcodePattern.test(tag[1]) || emojisByShortcode.has(tag[1])) continue;

		const url = parseEmojiUrl(tag[2]);
		if (!url) continue;

		emojisByShortcode.set(tag[1], { shortcode: tag[1], url });
	}

	return [...emojisByShortcode.values()];
}

export function tokenizeCustomEmojiText(
	text: string,
	customEmojis: CustomEmoji[]
): CustomEmojiTextToken[] {
	if (customEmojis.length === 0) return [{ type: 'text', text }];

	const emojiByShortcode = new Map(customEmojis.map((emoji) => [emoji.shortcode, emoji]));
	const tokens: CustomEmojiTextToken[] = [];
	let currentIndex = 0;

	for (const match of text.matchAll(shortcodeCandidatePattern)) {
		const matchIndex = match.index ?? 0;
		const emoji = emojiByShortcode.get(match[1]);
		if (!emoji) continue;

		if (matchIndex > currentIndex) {
			tokens.push({ type: 'text', text: text.slice(currentIndex, matchIndex) });
		}
		tokens.push({
			type: 'customEmoji',
			text: match[0],
			shortcode: emoji.shortcode,
			url: emoji.url
		});
		currentIndex = matchIndex + match[0].length;
	}

	if (currentIndex < text.length) {
		tokens.push({ type: 'text', text: text.slice(currentIndex) });
	}

	return tokens.length > 0 ? tokens : [{ type: 'text', text }];
}

function parseEmojiUrl(value: string) {
	try {
		const url = new URL(value);
		return url.protocol === 'https:' ? url.href : null;
	} catch {
		return null;
	}
}
