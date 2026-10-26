import { ChannelMessage, Reaction, Repost, ShortTextNote } from 'nostr-tools/kinds';
import { now, type EventSigner } from 'rx-nostr';
import type * as Nostr from 'nostr-typedef';
import { buildNip10ReplyTags, buildNip18QuoteRepost } from '$lib/deck/post-actions';
import { addContentMentionTags } from '$lib/deck/mention-actions';
import type { CustomEmojiDefinition, EmojiReaction, LikeReaction } from './emoji-reactions';
import { publishEvent, type PublishEventOptions } from './relay/publish-event';

export type PublishOptions = PublishEventOptions & {
	includeClientTag?: boolean;
	customEmojis?: CustomEmojiDefinition[];
};

export type PublishLikeReactionOptions = PublishOptions & {
	reaction?: LikeReaction;
};

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
