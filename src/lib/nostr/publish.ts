import { ChannelMessage, Reaction, Repost, ShortTextNote } from 'nostr-tools/kinds';
import { now, type EventSigner } from 'rx-nostr';
import { defaultIfEmpty, filter, firstValueFrom, map, take, TimeoutError } from 'rxjs';
import type * as Nostr from 'nostr-typedef';
import { buildNip10ReplyTags, buildNip18QuoteRepost } from '$lib/deck/post-actions';
import { addContentMentionTags } from '$lib/deck/mention-actions';
import { getNostrClient } from './client';
import type { CustomEmojiDefinition, EmojiReaction, LikeReaction } from './emoji-reactions';
import { normalizeRelay } from './relays';

import type { PublishDiagnostic } from './publish-diagnostics';

export type PublishStage = 'uploading-media' | 'signing' | 'publishing';
export type PublishFailureReason =
	| 'media-upload-failed'
	| 'signing-timeout'
	| 'signing-failed'
	| 'account-mismatch'
	| 'relay-timeout'
	| 'relay-rejected'
	| 'relay-failed';

export type PublishPostResult =
	| { ok: true; event: Nostr.Event }
	| {
			ok: false;
			reason: PublishFailureReason;
			stage: PublishStage;
			internalError?: unknown;
			targetRelayCount: number;
			diagnostic?: PublishDiagnostic;
	  };

export type PublishOptions = {
	includeClientTag?: boolean;
	signingTimeoutMs?: number;
	customEmojis?: CustomEmojiDefinition[];
};

export type PublishLikeReactionOptions = PublishOptions & {
	reaction?: LikeReaction;
};

type PublishEventTemplate = Pick<Nostr.Event, 'kind' | 'tags' | 'content' | 'created_at'>;
type PublishReactionTarget = Pick<Nostr.Event, 'id' | 'kind' | 'pubkey'>;
type PublishRepostTarget = Pick<Nostr.Event, 'id' | 'pubkey'>;
type PublishReplyTarget = Nostr.Event;
type PublishQuoteTarget = Nostr.Event;

const nostterClientTag = [
	'client',
	'nostter deck',
	'31990:83d52b4363d2d1bc5a098de7be67c120bfb7c0cee8efefd8eb6e42372af24689:1782011724356',
	'wss://yabu.me/'
] as const;

export const defaultSigningTimeoutMs = 30_000;

class SigningTimeoutError extends Error {
	constructor() {
		super('Signing request timed out');
		this.name = 'SigningTimeoutError';
	}
}

function withClientTag(tags: string[][], includeClientTag: boolean) {
	return includeClientTag ? [...tags, [...nostterClientTag]] : tags;
}

function addContentCustomEmojiTags(
	tags: string[][],
	content: string,
	customEmojis: CustomEmojiDefinition[]
) {
	const taggedShortcodes = new Set(
		tags.flatMap((tag) => (tag[0] === 'emoji' && tag[1] ? [tag[1]] : []))
	);
	const nextTags = [...tags];
	for (const emoji of customEmojis) {
		if (
			taggedShortcodes.has(emoji.shortcode) ||
			!isValidCustomEmojiDefinition(emoji) ||
			!content.includes(`:${emoji.shortcode}:`)
		) {
			continue;
		}

		taggedShortcodes.add(emoji.shortcode);
		nextTags.push(
			emoji.address
				? ['emoji', emoji.shortcode, emoji.url, emoji.address]
				: ['emoji', emoji.shortcode, emoji.url]
		);
	}
	return nextTags;
}

function addContentTags(tags: string[][], content: string, customEmojis: CustomEmojiDefinition[]) {
	return addContentCustomEmojiTags(addContentMentionTags(tags, content), content, customEmojis);
}

function isValidCustomEmojiDefinition(emoji: CustomEmojiDefinition) {
	if (!/^[A-Za-z0-9_-]+$/.test(emoji.shortcode)) {
		return false;
	}

	try {
		return new URL(emoji.url).protocol === 'https:';
	} catch {
		return false;
	}
}

function createReactionReferenceTags(target: PublishReactionTarget, targetReadRelays: string[]) {
	const relayHint = targetReadRelays[0];
	const eventTag = ['e', target.id, relayHint ?? '', target.pubkey];
	const pubkeyTag = relayHint ? ['p', target.pubkey, relayHint] : ['p', target.pubkey];
	return [eventTag, pubkeyTag, ['k', String(target.kind)]];
}

function createEmojiReactionPayload(reaction: EmojiReaction) {
	const tags =
		reaction.type === 'custom'
			? [
					reaction.address
						? ['emoji', reaction.shortcode, reaction.url, reaction.address]
						: ['emoji', reaction.shortcode, reaction.url]
				]
			: [];
	const content = reaction.type === 'unicode' ? reaction.emoji : `:${reaction.shortcode}:`;
	return { content, tags };
}

function createLikeReactionPayload(reaction: LikeReaction) {
	if (reaction.type === 'plus') {
		return { content: '+', tags: [] };
	}

	return createEmojiReactionPayload(reaction);
}

async function publishEvent(
	eventTemplate: PublishEventTemplate,
	pubkey: string,
	signer: EventSigner,
	relays?: string[],
	{ signingTimeoutMs = defaultSigningTimeoutMs }: Pick<PublishOptions, 'signingTimeoutMs'> = {}
): Promise<PublishPostResult> {
	const client = getNostrClient();
	const defaultPublishRelays = Object.values(
		client.getDefaultRelays({ filter: 'write-all' })
	).flatMap(({ url }) => {
		const normalized = normalizeRelay(url);
		return normalized ? [normalized] : [];
	});
	const publishRelays = relays
		? [
				...new Set(
					[...defaultPublishRelays, ...relays].flatMap((relay) => {
						const normalized = normalizeRelay(relay);
						return normalized ? [normalized] : [];
					})
				)
			]
		: undefined;
	const targetRelayCount = publishRelays?.length ?? new Set(defaultPublishRelays).size;

	let signedEvent: Nostr.Event;
	try {
		signedEvent = await withTimeout(signer.signEvent(eventTemplate), signingTimeoutMs);
	} catch (error) {
		return publishFailure(
			error instanceof SigningTimeoutError ? 'signing-timeout' : 'signing-failed',
			'signing',
			targetRelayCount,
			error
		);
	}

	if (!isSignedEvent(signedEvent)) {
		return publishFailure(
			'signing-failed',
			'signing',
			targetRelayCount,
			new Error('Signer returned a malformed event')
		);
	}

	if (signedEvent.pubkey.toLowerCase() !== pubkey.toLowerCase()) {
		return publishFailure('account-mismatch', 'signing', targetRelayCount);
	}

	const signedEventSigner: EventSigner = {
		getPublicKey: () => signer.getPublicKey(),
		signEvent: async <K extends number>() => signedEvent as Nostr.Event<K>
	};

	try {
		if (targetRelayCount === 0) {
			return publishFailure(
				'relay-failed',
				'publishing',
				0,
				new Error('No writable relays configured')
			);
		}
		const accepted = await firstValueFrom(
			client
				.send(signedEvent, {
					signer: signedEventSigner,
					completeOn: 'all-ok',
					errorOnTimeout: true,
					...(publishRelays ? { on: { relays: publishRelays } } : {})
				})
				.pipe(
					filter((packet) => packet.ok),
					take(1),
					map(() => true),
					defaultIfEmpty(false)
				)
		);
		if (!accepted) {
			return publishFailure('relay-rejected', 'publishing', targetRelayCount);
		}
		return { ok: true, event: signedEvent };
	} catch (error) {
		return publishFailure(
			error instanceof TimeoutError ? 'relay-timeout' : 'relay-failed',
			'publishing',
			targetRelayCount,
			error
		);
	}
}

function publishFailure(
	reason: PublishFailureReason,
	stage: PublishStage,
	targetRelayCount: number,
	internalError?: unknown
): Extract<PublishPostResult, { ok: false }> {
	return {
		ok: false,
		reason,
		stage,
		targetRelayCount,
		...(internalError ? { internalError } : {})
	};
}

function withTimeout<T>(source: Promise<T>, timeoutMs: number) {
	const { promise: timeout, reject } = Promise.withResolvers<never>();
	const timer = setTimeout(() => reject(new SigningTimeoutError()), Math.max(0, timeoutMs));
	return Promise.race([source, timeout]).finally(() => clearTimeout(timer));
}

function isSignedEvent(value: unknown): value is Nostr.Event {
	if (!value || typeof value !== 'object') {
		return false;
	}
	const event = value as Partial<Nostr.Event>;
	return (
		typeof event.kind === 'number' &&
		Number.isFinite(event.kind) &&
		typeof event.created_at === 'number' &&
		Number.isFinite(event.created_at) &&
		typeof event.content === 'string' &&
		Array.isArray(event.tags) &&
		event.tags.every(
			(tag) => Array.isArray(tag) && tag.every((entry) => typeof entry === 'string')
		) &&
		typeof event.id === 'string' &&
		/^[0-9a-f]{64}$/i.test(event.id) &&
		typeof event.pubkey === 'string' &&
		/^[0-9a-f]{64}$/i.test(event.pubkey) &&
		typeof event.sig === 'string' &&
		/^[0-9a-f]{128}$/i.test(event.sig)
	);
}

export function publishShortTextNote(
	content: string,
	pubkey: string,
	signer: EventSigner,
	{ includeClientTag = false, signingTimeoutMs, customEmojis = [] }: PublishOptions = {}
) {
	return publishEvent(
		{
			kind: ShortTextNote,
			tags: withClientTag(addContentTags([], content, customEmojis), includeClientTag),
			content,
			created_at: now()
		},
		pubkey,
		signer,
		undefined,
		{ signingTimeoutMs }
	);
}

export function publishChannelMessage(
	content: string,
	channelId: string,
	pubkey: string,
	signer: EventSigner,
	channelRelays: string[],
	{ includeClientTag = false, signingTimeoutMs, customEmojis = [] }: PublishOptions = {}
) {
	return publishEvent(
		{
			kind: ChannelMessage,
			tags: withClientTag(
				addContentTags([['e', channelId, '', 'root']], content, customEmojis),
				includeClientTag
			),
			content,
			created_at: now()
		},
		pubkey,
		signer,
		channelRelays,
		{ signingTimeoutMs }
	);
}

export function publishReply(
	content: string,
	target: PublishReplyTarget,
	pubkey: string,
	signer: EventSigner,
	targetReadRelays: string[],
	{ includeClientTag = false, signingTimeoutMs, customEmojis = [] }: PublishOptions = {}
) {
	return publishEvent(
		{
			kind: ShortTextNote,
			tags: withClientTag(
				addContentTags(buildNip10ReplyTags(target, targetReadRelays), content, customEmojis),
				includeClientTag
			),
			content,
			created_at: now()
		},
		pubkey,
		signer,
		targetReadRelays,
		{ signingTimeoutMs }
	);
}

export function publishQuoteRepost(
	content: string,
	target: PublishQuoteTarget,
	pubkey: string,
	signer: EventSigner,
	targetReadRelays: string[],
	{ includeClientTag = false, signingTimeoutMs, customEmojis = [] }: PublishOptions = {}
) {
	const quote = buildNip18QuoteRepost(content, target, targetReadRelays);

	return publishEvent(
		{
			kind: ShortTextNote,
			tags: withClientTag(
				addContentTags(quote.tags, quote.content, customEmojis),
				includeClientTag
			),
			content: quote.content,
			created_at: now()
		},
		pubkey,
		signer,
		targetReadRelays,
		{ signingTimeoutMs }
	);
}

export function publishLikeReaction(
	target: PublishReactionTarget,
	pubkey: string,
	signer: EventSigner,
	targetReadRelays: string[],
	{
		includeClientTag = false,
		reaction = { type: 'plus' },
		signingTimeoutMs
	}: PublishLikeReactionOptions = {}
) {
	const payload = createLikeReactionPayload(reaction);
	return publishEvent(
		{
			kind: Reaction,
			tags: withClientTag(
				[...createReactionReferenceTags(target, targetReadRelays), ...payload.tags],
				includeClientTag
			),
			content: payload.content,
			created_at: now()
		},
		pubkey,
		signer,
		targetReadRelays,
		{ signingTimeoutMs }
	);
}

export function publishRepost(
	target: PublishRepostTarget,
	pubkey: string,
	signer: EventSigner,
	{ includeClientTag = false, signingTimeoutMs }: PublishOptions = {}
) {
	return publishEvent(
		{
			kind: Repost,
			tags: withClientTag(
				[
					['e', target.id],
					['p', target.pubkey]
				],
				includeClientTag
			),
			content: '',
			created_at: now()
		},
		pubkey,
		signer,
		undefined,
		{ signingTimeoutMs }
	);
}

export function publishEmojiReaction(
	target: PublishReactionTarget,
	reaction: EmojiReaction,
	pubkey: string,
	signer: EventSigner,
	targetReadRelays: string[],
	{ includeClientTag = false, signingTimeoutMs }: PublishOptions = {}
) {
	const payload = createEmojiReactionPayload(reaction);

	return publishEvent(
		{
			kind: Reaction,
			tags: withClientTag(
				[...createReactionReferenceTags(target, targetReadRelays), ...payload.tags],
				includeClientTag
			),
			content: payload.content,
			created_at: now()
		},
		pubkey,
		signer,
		targetReadRelays,
		{ signingTimeoutMs }
	);
}
