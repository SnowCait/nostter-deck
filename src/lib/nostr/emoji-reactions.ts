import { createRxBackwardReq, type LazyFilter } from 'rx-nostr';
import type * as Nostr from 'nostr-typedef';
import { Emojisets, UserEmojiList } from 'nostr-tools/kinds';
import { getNostrClient } from './client';
import { combineRelays, defaultRelays, normalizeRelay } from './relays';

export type EmojiReaction =
	| { type: 'unicode'; emoji: string }
	| { type: 'custom'; shortcode: string; url: string; address?: string };

export type CustomEmojiReactionCandidate = {
	id: string;
	pickerName: string;
	primaryShortcode: string;
	shortcodes: string[];
	url: string;
	address?: string;
	categoryId?: string;
	categoryLabel?: string;
	categoryOrder?: number;
};

export type EmojiSetReference = {
	address: string;
	pubkey: string;
	identifier: string;
	relay?: string;
};

type RawEmojiCandidate = {
	shortcode: string;
	url: string;
	address?: string;
	categoryId?: string;
	categoryLabel?: string;
	categoryOrder?: number;
};

type EmojiCandidateSource = {
	address?: string;
	categoryId?: string;
	categoryLabel?: string;
	categoryOrder?: number;
};

const emojiReactionRequestTimeoutMs = 5_000;

function isValidShortcode(value: string) {
	return /^[A-Za-z0-9_+-]+$/.test(value);
}

function isPubkey(value: string) {
	return /^[0-9a-f]{64}$/i.test(value);
}

function normalizeEmojiUrl(value: string) {
	try {
		const url = new URL(value);
		if (url.protocol !== 'https:') return null;
		return url.href;
	} catch {
		return null;
	}
}

function getTagValue(tags: Nostr.Event['tags'], tagName: string) {
	const value = tags.find((tag) => tag[0] === tagName && typeof tag[1] === 'string')?.[1]?.trim();
	return value && value.length > 0 ? value : null;
}

function getEmojiSetIdentifier(event: Nostr.Event) {
	return getTagValue(event.tags, 'd');
}

function getEmojiSetAddress(event: Nostr.Event) {
	const identifier = getEmojiSetIdentifier(event);
	return identifier ? `${Emojisets}:${event.pubkey}:${identifier}` : null;
}

export function parseEmojiSetCategory(
	event: Nostr.Event,
	categoryOrder: number
): EmojiCandidateSource | null {
	const identifier = getEmojiSetIdentifier(event);
	const address = getEmojiSetAddress(event);
	if (!identifier || !address) return null;

	return {
		address,
		categoryId: address,
		categoryLabel: getTagValue(event.tags, 'title') ?? identifier,
		categoryOrder
	};
}

export function parseEmojiSetReference(value: string, relay?: string): EmojiSetReference | null {
	const [kind, pubkey, ...identifierParts] = value.split(':');
	const identifier = identifierParts.join(':');
	if (kind !== String(Emojisets) || !isPubkey(pubkey) || identifier.length === 0) return null;

	const normalizedRelay = relay ? normalizeRelay(relay) : null;
	return {
		address: `${Emojisets}:${pubkey.toLowerCase()}:${identifier}`,
		pubkey: pubkey.toLowerCase(),
		identifier,
		...(normalizedRelay ? { relay: normalizedRelay } : {})
	};
}

export function parseUserEmojiSetReferences(tags: Nostr.Event['tags']): EmojiSetReference[] {
	const references: EmojiSetReference[] = [];
	const seen = new Set<string>();
	for (const tag of tags) {
		if (tag[0] !== 'a' || typeof tag[1] !== 'string') continue;

		const reference = parseEmojiSetReference(
			tag[1],
			typeof tag[2] === 'string' ? tag[2] : undefined
		);
		if (!reference || seen.has(reference.address)) continue;

		seen.add(reference.address);
		references.push(reference);
	}
	return references;
}

export function parseEmojiTagCandidates(
	tags: Nostr.Event['tags'],
	source: EmojiCandidateSource | string = {}
): RawEmojiCandidate[] {
	const sourceOptions = typeof source === 'string' ? { address: source } : source;
	return tags.flatMap((tag) => {
		if (tag[0] !== 'emoji' || typeof tag[1] !== 'string' || typeof tag[2] !== 'string') return [];
		return [
			{
				shortcode: tag[1],
				url: tag[2],
				...(sourceOptions.address ? { address: sourceOptions.address } : {}),
				...(sourceOptions.categoryId ? { categoryId: sourceOptions.categoryId } : {}),
				...(sourceOptions.categoryLabel ? { categoryLabel: sourceOptions.categoryLabel } : {}),
				...(sourceOptions.categoryOrder !== undefined
					? { categoryOrder: sourceOptions.categoryOrder }
					: {})
			}
		];
	});
}

export function normalizeCustomEmojiReactionCandidates(
	candidates: RawEmojiCandidate[]
): CustomEmojiReactionCandidate[] {
	const byUrl = new Map<
		string,
		{
			shortcodes: string[];
			shortcodeSet: Set<string>;
			address?: string;
			categoryId?: string;
			categoryLabel?: string;
			categoryOrder?: number;
		}
	>();

	for (const candidate of candidates) {
		if (!isValidShortcode(candidate.shortcode)) continue;

		const url = normalizeEmojiUrl(candidate.url);
		if (!url) continue;

		const groupKey = `${candidate.categoryId ?? ''}\u0000${url}`;
		const entry = byUrl.get(groupKey) ?? {
			shortcodes: [],
			shortcodeSet: new Set<string>(),
			...(candidate.categoryId ? { categoryId: candidate.categoryId } : {}),
			...(candidate.categoryLabel ? { categoryLabel: candidate.categoryLabel } : {}),
			...(candidate.categoryOrder !== undefined ? { categoryOrder: candidate.categoryOrder } : {})
		};
		if (!entry.shortcodeSet.has(candidate.shortcode)) {
			entry.shortcodeSet.add(candidate.shortcode);
			entry.shortcodes.push(candidate.shortcode);
		}
		if (!entry.address && candidate.address) entry.address = candidate.address;
		byUrl.set(groupKey, entry);
	}

	const usedPickerNames = new Set<string>();
	return [...byUrl.entries()].map(([groupKey, entry]) => {
		const url = groupKey.split('\u0000')[1] ?? groupKey;
		const primaryShortcode = entry.shortcodes[0];
		let pickerName = primaryShortcode;
		let suffix = 2;
		while (usedPickerNames.has(pickerName.toLowerCase())) {
			pickerName = `${primaryShortcode}_${suffix}`;
			suffix += 1;
		}
		usedPickerNames.add(pickerName.toLowerCase());

		return {
			id: entry.categoryId ? `${entry.categoryId}:${url}` : url,
			pickerName,
			primaryShortcode,
			shortcodes: entry.shortcodes,
			url,
			...(entry.address ? { address: entry.address } : {}),
			...(entry.categoryId ? { categoryId: entry.categoryId } : {}),
			...(entry.categoryLabel ? { categoryLabel: entry.categoryLabel } : {}),
			...(entry.categoryOrder !== undefined ? { categoryOrder: entry.categoryOrder } : {})
		};
	});
}

export function getEmojiReactionFromCandidate(
	candidate: CustomEmojiReactionCandidate
): EmojiReaction {
	return {
		type: 'custom',
		shortcode: candidate.primaryShortcode,
		url: candidate.url,
		...(candidate.address ? { address: candidate.address } : {})
	};
}

export async function loadUserEmojiReactionCandidates(
	pubkey: string,
	relays: string[] = [...defaultRelays]
) {
	const requestRelays = combineRelays(relays, [...defaultRelays]);
	const userEmojiList = await requestLatestEvent(
		{ kinds: [UserEmojiList], authors: [pubkey], limit: 1 },
		requestRelays
	);
	if (!userEmojiList) return [];

	const userEmojiCategory = {
		categoryId: `${UserEmojiList}:${userEmojiList.pubkey}`,
		categoryLabel: getTagValue(userEmojiList.tags, 'title') ?? 'My emojis',
		categoryOrder: 0
	};
	const directCandidates = parseEmojiTagCandidates(userEmojiList.tags, userEmojiCategory);
	const emojiSetReferences = parseUserEmojiSetReferences(userEmojiList.tags);
	const emojiSetEvents = await Promise.all(
		emojiSetReferences.map(async (reference, index) => ({
			event: await requestLatestEvent(
				{
					kinds: [Emojisets],
					authors: [reference.pubkey],
					'#d': [reference.identifier],
					limit: 1
				},
				combineRelays(reference.relay ? [reference.relay] : [], requestRelays)
			),
			categoryOrder: index + 1
		}))
	);
	const emojiSetCandidates = emojiSetEvents.flatMap(({ event, categoryOrder }) => {
		if (!event) return [];
		const category = parseEmojiSetCategory(event, categoryOrder);
		return category ? parseEmojiTagCandidates(event.tags, category) : [];
	});

	return normalizeCustomEmojiReactionCandidates([...directCandidates, ...emojiSetCandidates]);
}

function requestLatestEvent(filter: LazyFilter, relays: string[]): Promise<Nostr.Event | null> {
	return new Promise((resolve) => {
		const request = createRxBackwardReq();
		let latestEvent: Nostr.Event | null = null;
		let finished = false;
		const finish = (value: Nostr.Event | null) => {
			if (finished) return;
			finished = true;
			clearTimeout(timeoutId);
			subscription.unsubscribe();
			resolve(value);
		};
		const subscription = getNostrClient()
			.use(request)
			.subscribe({
				next: ({ event }) => {
					if (
						!latestEvent ||
						event.created_at > latestEvent.created_at ||
						(event.created_at === latestEvent.created_at && event.id > latestEvent.id)
					) {
						latestEvent = event;
					}
				},
				complete: () => finish(latestEvent)
			});
		const timeoutId = setTimeout(() => finish(null), emojiReactionRequestTimeoutMs);

		request.emit(filter, { relays });
		request.over();
	});
}
