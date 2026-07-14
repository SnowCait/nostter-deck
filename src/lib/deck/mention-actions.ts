import type * as Nostr from 'nostr-typedef';
import { npubEncode } from 'nostr-tools/nip19';
import { decodeProfilePointer } from '$lib/nostr/nip19';
import { normalizePubkey } from '$lib/nostr/pubkeys';

export type MentionCandidate = {
	pubkey: string;
	displayName: string;
	npub: string;
	nip05?: string;
	searchNames: string[];
	isFollowing: boolean;
	hasProfile: boolean;
};

export type MentionRange = {
	start: number;
	end: number;
	pubkey: string;
};

export type ActiveMentionQuery = {
	start: number;
	end: number;
	query: string;
};

export type MentionProfileEntry = {
	pubkey: string;
	profile: Nostr.Content.Metadata;
};

const mentionReferencePattern = /nostr:((?:npub|nprofile)1[02-9ac-hj-np-z]+)/gi;
const mentionBoundaryPattern = /[\s\p{Ps}\p{Pi}]/u;
const mentionSeparatorPattern = /[\s\p{P}]/u;

function normalizeProfileText(value: unknown) {
	if (typeof value !== 'string') {
		return null;
	}

	const normalized = value.replace(/\s+/gu, ' ').trim();
	return normalized.length > 0 ? normalized : null;
}

function normalizeDisplayName(value: unknown) {
	const normalized = normalizeProfileText(value)?.replace(/^@+/u, '').trim();
	return normalized && normalized.length > 0 ? normalized : null;
}

function compareText(left: string, right: string) {
	return left < right ? -1 : left > right ? 1 : 0;
}

export function createMentionCandidates(
	profileEntries: MentionProfileEntry[],
	followedPubkeys: string[]
) {
	const followed = new Set(
		followedPubkeys.flatMap((pubkey) => {
			const normalized = normalizePubkey(pubkey);
			return normalized ? [normalized] : [];
		})
	);
	const profiles = new Map<string, Nostr.Content.Metadata>();
	for (const entry of profileEntries) {
		const pubkey = normalizePubkey(entry.pubkey);
		if (pubkey) {
			profiles.set(pubkey, entry.profile);
		}
	}

	const pubkeys = new Set([...followed, ...profiles.keys()]);
	return [...pubkeys].map((pubkey): MentionCandidate => {
		const profile = profiles.get(pubkey);
		const npub = npubEncode(pubkey);
		const displayName =
			normalizeDisplayName(profile?.display_name) ??
			normalizeDisplayName(profile?.name) ??
			npub.slice(0, 12);
		const nip05 = normalizeProfileText(profile?.nip05) ?? undefined;
		const searchNames = [
			displayName,
			normalizeProfileText(profile?.display_name),
			normalizeProfileText(profile?.name),
			nip05,
			npub
		].filter((value): value is string => Boolean(value));

		return {
			pubkey,
			displayName,
			npub,
			...(nip05 ? { nip05 } : {}),
			searchNames: [...new Set(searchNames)],
			isFollowing: followed.has(pubkey),
			hasProfile: profile !== undefined
		};
	});
}

export function searchMentionCandidates(candidates: MentionCandidate[], query: string, limit = 8) {
	const normalizedQuery = query.toLocaleLowerCase();
	return candidates
		.flatMap((candidate) => {
			const names = candidate.searchNames.map((value) => value.toLocaleLowerCase());
			const matchRank = names.some((value) => value.startsWith(normalizedQuery))
				? 0
				: names.some((value) => value.includes(normalizedQuery))
					? 1
					: null;
			return matchRank === null ? [] : [{ candidate, matchRank }];
		})
		.sort(
			(left, right) =>
				left.matchRank - right.matchRank ||
				Number(right.candidate.isFollowing) - Number(left.candidate.isFollowing) ||
				compareText(
					left.candidate.displayName.toLocaleLowerCase(),
					right.candidate.displayName.toLocaleLowerCase()
				) ||
				compareText(left.candidate.pubkey, right.candidate.pubkey)
		)
		.slice(0, limit)
		.map(({ candidate }) => candidate);
}

export function getActiveMentionQuery(
	text: string,
	selectionStart: number,
	selectionEnd: number,
	mentions: MentionRange[] = []
): ActiveMentionQuery | null {
	if (selectionStart !== selectionEnd || selectionStart < 1 || selectionStart > text.length) {
		return null;
	}
	if (
		mentions.some((mention) => selectionStart >= mention.start && selectionStart <= mention.end)
	) {
		return null;
	}

	for (let index = selectionStart - 1; index >= 0; index -= 1) {
		const character = text[index];
		if (/\s/u.test(character)) {
			return null;
		}
		if (character !== '@') {
			continue;
		}

		const previousCharacter = index > 0 ? text[index - 1] : null;
		if (previousCharacter !== null && !mentionBoundaryPattern.test(previousCharacter)) {
			continue;
		}

		return {
			start: index,
			end: selectionStart,
			query: text.slice(index + 1, selectionStart)
		};
	}

	return null;
}

export function reconcileMentionRanges(
	previousText: string,
	nextText: string,
	mentions: MentionRange[]
) {
	if (previousText === nextText) {
		return mentions;
	}

	let editStart = 0;
	while (
		editStart < previousText.length &&
		editStart < nextText.length &&
		previousText[editStart] === nextText[editStart]
	) {
		editStart += 1;
	}

	let sharedSuffixLength = 0;
	while (
		sharedSuffixLength < previousText.length - editStart &&
		sharedSuffixLength < nextText.length - editStart &&
		previousText[previousText.length - sharedSuffixLength - 1] ===
			nextText[nextText.length - sharedSuffixLength - 1]
	) {
		sharedSuffixLength += 1;
	}

	const previousEditEnd = previousText.length - sharedSuffixLength;
	const delta = nextText.length - previousText.length;
	return mentions.flatMap((mention) => {
		if (previousEditEnd <= mention.start) {
			return [{ ...mention, start: mention.start + delta, end: mention.end + delta }];
		}
		if (editStart >= mention.end) {
			return [mention];
		}
		return [];
	});
}

export function applyTextInsertion(
	text: string,
	mentions: MentionRange[],
	selectionStart: number,
	selectionEnd: number,
	insertion: string
) {
	const normalizedStart = normalizeSelectionOffset(selectionStart, text.length);
	const normalizedEnd = normalizeSelectionOffset(selectionEnd, text.length);
	const start = Math.min(normalizedStart, normalizedEnd);
	const end = Math.max(normalizedStart, normalizedEnd);
	const nextText = `${text.slice(0, start)}${insertion}${text.slice(end)}`;
	const caret = start + insertion.length;

	return {
		text: nextText,
		mentions: reconcileMentionRanges(text, nextText, mentions),
		caret
	};
}

function normalizeSelectionOffset(value: number, textLength: number) {
	return Number.isFinite(value) ? Math.min(Math.max(Math.trunc(value), 0), textLength) : textLength;
}

export function applyMentionSelection(
	text: string,
	mentions: MentionRange[],
	query: ActiveMentionQuery,
	candidate: MentionCandidate
) {
	const displayMention = `@${candidate.displayName}`;
	const followingCharacter = text[query.end];
	const separator =
		followingCharacter === undefined || !mentionSeparatorPattern.test(followingCharacter)
			? ' '
			: '';
	const nextText = `${text.slice(0, query.start)}${displayMention}${separator}${text.slice(query.end)}`;
	const nextMentions = reconcileMentionRanges(text, nextText, mentions);
	nextMentions.push({
		start: query.start,
		end: query.start + displayMention.length,
		pubkey: candidate.pubkey
	});
	nextMentions.sort((left, right) => left.start - right.start);

	return {
		text: nextText,
		mentions: nextMentions,
		caret: query.start + displayMention.length + separator.length
	};
}

export function serializeMentionText(text: string, mentions: MentionRange[]) {
	let canonical = '';
	let currentIndex = 0;
	for (const mention of [...mentions].sort((left, right) => left.start - right.start)) {
		const pubkey = normalizePubkey(mention.pubkey);
		if (
			!pubkey ||
			mention.start < currentIndex ||
			mention.start < 0 ||
			mention.end <= mention.start ||
			mention.end > text.length
		) {
			continue;
		}
		canonical += text.slice(currentIndex, mention.start);
		canonical += `nostr:${npubEncode(pubkey)}`;
		currentIndex = mention.end;
	}
	return canonical + text.slice(currentIndex);
}

export function hydrateCanonicalMentions(
	canonical: string,
	candidates: MentionCandidate[]
): { text: string; mentions: MentionRange[] } {
	const candidatesByPubkey = new Map(
		candidates
			.filter((candidate) => candidate.hasProfile)
			.map((candidate) => [candidate.pubkey, candidate])
	);
	let text = '';
	let currentIndex = 0;
	const mentions: MentionRange[] = [];
	for (const match of canonical.matchAll(mentionReferencePattern)) {
		const matchIndex = match.index ?? 0;
		const pointer = decodeProfilePointer(match[1]);
		const candidate = pointer ? candidatesByPubkey.get(pointer.pubkey) : undefined;
		if (!candidate) {
			continue;
		}

		text += canonical.slice(currentIndex, matchIndex);
		const displayMention = `@${candidate.displayName}`;
		const start = text.length;
		text += displayMention;
		mentions.push({ start, end: start + displayMention.length, pubkey: candidate.pubkey });
		currentIndex = matchIndex + match[0].length;
	}
	text += canonical.slice(currentIndex);
	return { text, mentions };
}

export function extractMentionPubkeys(content: string) {
	const pubkeys: string[] = [];
	for (const match of content.matchAll(mentionReferencePattern)) {
		const pointer = decodeProfilePointer(match[1]);
		if (pointer && !pubkeys.includes(pointer.pubkey)) {
			pubkeys.push(pointer.pubkey);
		}
	}
	return pubkeys;
}

export function addContentMentionTags(tags: string[][], content: string) {
	const taggedPubkeys = new Set(
		tags.flatMap((tag) => {
			const pubkey = tag[0] === 'p' ? normalizePubkey(tag[1]) : null;
			return pubkey ? [pubkey] : [];
		})
	);
	const nextTags = [...tags];
	for (const pubkey of extractMentionPubkeys(content)) {
		if (taggedPubkeys.has(pubkey)) {
			continue;
		}
		taggedPubkeys.add(pubkey);
		nextTags.push(['p', pubkey]);
	}
	return nextTags;
}
