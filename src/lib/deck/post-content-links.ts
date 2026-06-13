import { decode } from 'nostr-tools/nip19';
import { normalizeRelay } from '$lib/nostr/relays';
import { tokenizeCustomEmojiText, type CustomEmoji } from '$lib/nostr/custom-emoji';

declare global {
	interface URLConstructor {
		canParse(url: string | URL, base?: string | URL): boolean;
	}
}

export type PostContentToken =
	| {
			type: 'text';
			text: string;
	  }
	| {
			type: 'link';
			text: string;
			href: string;
	  }
	| {
			type: 'nostrReference';
			text: string;
			href: string;
			entityType: NostrReferenceEntityType;
			identifier: string;
			pubkey?: string;
			eventId?: string;
			relayHints?: string[];
	  }
	| {
			type: 'customEmoji';
			text: string;
			shortcode: string;
			url: string;
	  }
	| {
			type: 'hashtag';
			text: string;
			tag: string;
	  };

const nostrReferenceEntityTypes = ['npub', 'nprofile', 'note', 'nevent', 'naddr'] as const;
type NostrReferenceEntityType = (typeof nostrReferenceEntityTypes)[number];
const nostrReferenceEntityPattern = nostrReferenceEntityTypes.join('|');

const linkCandidatePattern = new RegExp(
	`https?:\\/\\/[^\\s<>"']+|nostr:(?:${nostrReferenceEntityPattern})1[02-9ac-hj-np-z]+`,
	'gi'
);
const nostrReferencePattern = new RegExp(
	`^nostr:((${nostrReferenceEntityPattern})1[02-9ac-hj-np-z]+)$`,
	'i'
);
const trailingUrlPunctuationPattern = /[),.;:!?，、。！？）］】]+$/;
const hashtagPattern = /(^|[^\p{L}\p{N}_])#([\p{L}\p{N}_]+)/gu;

ensureUrlCanParse();

export function linkifyPostContent(
	content: string,
	customEmojis: CustomEmoji[] = []
): PostContentToken[] {
	const tokens: PostContentToken[] = [];
	let currentIndex = 0;

	for (const match of content.matchAll(linkCandidatePattern)) {
		const candidate = match[0];
		const matchIndex = match.index ?? 0;
		const linkText = trimTrailingUrlPunctuation(candidate);
		const token = parseLinkCandidate(linkText);

		if (!token) {
			continue;
		}

		if (matchIndex > currentIndex) {
			tokens.push(...tokenizeText(content.slice(currentIndex, matchIndex), customEmojis));
		}

		tokens.push(token);
		currentIndex = matchIndex + linkText.length;
	}

	if (currentIndex < content.length) {
		tokens.push(...tokenizeText(content.slice(currentIndex), customEmojis));
	}

	return tokens.length > 0 ? tokens : [{ type: 'text', text: content }];
}

function tokenizeText(text: string, customEmojis: CustomEmoji[]): PostContentToken[] {
	const tokens: PostContentToken[] = [];
	let currentIndex = 0;

	for (const match of text.matchAll(hashtagPattern)) {
		const prefix = match[1];
		const hashtag = match[0].slice(prefix.length);
		const matchIndex = (match.index ?? 0) + prefix.length;

		if (matchIndex > currentIndex) {
			tokens.push(...tokenizeCustomEmojiText(text.slice(currentIndex, matchIndex), customEmojis));
		}
		tokens.push({
			type: 'hashtag',
			text: hashtag,
			tag: match[2]
		});
		currentIndex = matchIndex + hashtag.length;
	}

	if (currentIndex < text.length) {
		tokens.push(...tokenizeCustomEmojiText(text.slice(currentIndex), customEmojis));
	}

	return tokens;
}

function trimTrailingUrlPunctuation(value: string) {
	return value.replace(trailingUrlPunctuationPattern, '');
}

function parseLinkCandidate(
	value: string
): Extract<PostContentToken, { type: 'link' | 'nostrReference' }> | null {
	if (value.length === 0) return null;

	const nostrReference = parseNostrReference(value);
	if (nostrReference) return nostrReference;

	if (!URL.canParse(value)) return null;

	const url = new URL(value);
	if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;

	return {
		type: 'link',
		text: value,
		href: url.href
	};
}

function parseNostrReference(
	value: string
): Extract<PostContentToken, { type: 'nostrReference' }> | null {
	const match = nostrReferencePattern.exec(value);
	if (!match) return null;

	const entityType = match[2].toLowerCase();
	if (!isNostrReferenceEntityType(entityType)) return null;
	const nostrReference = parseNostrReferenceData(match[1], entityType);
	if (!nostrReference) return null;

	return {
		type: 'nostrReference',
		text: value,
		href: `nostr:${match[1]}`,
		entityType,
		identifier: match[1],
		...nostrReference
	};
}

function parseNostrReferenceData(identifier: string, entityType: NostrReferenceEntityType) {
	try {
		const decoded = decode(identifier);
		if (decoded.type !== entityType) return null;

		switch (decoded.type) {
			case 'npub':
				return { pubkey: decoded.data };
			case 'nprofile':
				return {
					pubkey: decoded.data.pubkey,
					relayHints:
						decoded.data.relays?.map(normalizeRelay).filter((relay) => relay !== null) ?? []
				};
			case 'note':
				return { eventId: decoded.data };
			case 'nevent':
				return {
					eventId: decoded.data.id,
					relayHints:
						decoded.data.relays?.map(normalizeRelay).filter((relay) => relay !== null) ?? []
				};
			default:
				return {};
		}
	} catch {
		return null;
	}
}

function isNostrReferenceEntityType(value: string): value is NostrReferenceEntityType {
	return nostrReferenceEntityTypes.includes(value as NostrReferenceEntityType);
}

function ensureUrlCanParse() {
	if (typeof URL.canParse === 'function') return;

	Object.defineProperty(URL, 'canParse', {
		configurable: true,
		writable: true,
		value(url: string | URL, base?: string | URL) {
			try {
				new URL(url, base);
				return true;
			} catch {
				return false;
			}
		}
	});
}
