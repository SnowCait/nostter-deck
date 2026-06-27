import { ChannelMessage, Reaction, ShortTextNote } from 'nostr-tools/kinds';
import { now } from 'rx-nostr';
import { catchError, defaultIfEmpty, filter, firstValueFrom, map, of, take } from 'rxjs';
import type * as Nostr from 'nostr-typedef';
import { getNostrClient } from './client';
import type { Nip07Signer } from './auth.svelte';
import type { EmojiReaction } from './emoji-reactions';

export type PublishPostResult =
	| { ok: true; event: Nostr.Event }
	| { ok: false; reason: 'signing-failed' | 'account-mismatch' | 'relay-failed' };

export type PublishOptions = {
	includeClientTag?: boolean;
};

type PublishEventTemplate = Pick<Nostr.Event, 'kind' | 'tags' | 'content' | 'created_at'>;
type PublishReactionTarget = Pick<Nostr.Event, 'id' | 'kind' | 'pubkey'>;

const nostterClientTag = [
	'client',
	'nostter deck',
	'31990:83d52b4363d2d1bc5a098de7be67c120bfb7c0cee8efefd8eb6e42372af24689:1782011724356',
	'wss://yabu.me/'
] as const;

function withClientTag(tags: string[][], includeClientTag: boolean) {
	return includeClientTag ? [...tags, [...nostterClientTag]] : tags;
}

function createReactionReferenceTags(target: PublishReactionTarget, targetReadRelays: string[]) {
	const relayHint = targetReadRelays[0];
	const eventTag = ['e', target.id, relayHint ?? '', target.pubkey];
	const pubkeyTag = relayHint ? ['p', target.pubkey, relayHint] : ['p', target.pubkey];
	return [eventTag, pubkeyTag, ['k', String(target.kind)]];
}

async function publishEvent(
	eventTemplate: PublishEventTemplate,
	pubkey: string,
	signer: Nip07Signer,
	relays?: string[]
): Promise<PublishPostResult> {
	let signedEvent: Nostr.Event;
	try {
		signedEvent = await signer.signEvent(eventTemplate);
	} catch {
		return { ok: false, reason: 'signing-failed' };
	}

	if (signedEvent.pubkey.toLowerCase() !== pubkey.toLowerCase()) {
		return { ok: false, reason: 'account-mismatch' };
	}

	try {
		const accepted = await firstValueFrom(
			getNostrClient()
				.send(signedEvent, {
					completeOn: 'all-ok',
					errorOnTimeout: true,
					...(relays ? { on: { defaultWriteRelays: true, relays } } : {})
				})
				.pipe(
					filter((packet) => packet.ok),
					take(1),
					map(() => true),
					defaultIfEmpty(false),
					catchError(() => of(false))
				)
		);
		if (!accepted) return { ok: false, reason: 'relay-failed' };
		return { ok: true, event: signedEvent };
	} catch {
		return { ok: false, reason: 'relay-failed' };
	}
}

export function publishShortTextNote(
	content: string,
	pubkey: string,
	signer: Nip07Signer,
	{ includeClientTag = false }: PublishOptions = {}
) {
	return publishEvent(
		{
			kind: ShortTextNote,
			tags: withClientTag([], includeClientTag),
			content,
			created_at: now()
		},
		pubkey,
		signer
	);
}

export function publishChannelMessage(
	content: string,
	channelId: string,
	pubkey: string,
	signer: Nip07Signer,
	channelRelays: string[],
	{ includeClientTag = false }: PublishOptions = {}
) {
	return publishEvent(
		{
			kind: ChannelMessage,
			tags: withClientTag([['e', channelId, '', 'root']], includeClientTag),
			content,
			created_at: now()
		},
		pubkey,
		signer,
		channelRelays
	);
}

export function publishLikeReaction(
	target: PublishReactionTarget,
	pubkey: string,
	signer: Nip07Signer,
	targetReadRelays: string[],
	{ includeClientTag = false }: PublishOptions = {}
) {
	return publishEvent(
		{
			kind: Reaction,
			tags: withClientTag(createReactionReferenceTags(target, targetReadRelays), includeClientTag),
			content: '+',
			created_at: now()
		},
		pubkey,
		signer,
		targetReadRelays
	);
}

export function publishEmojiReaction(
	target: PublishReactionTarget,
	reaction: EmojiReaction,
	pubkey: string,
	signer: Nip07Signer,
	targetReadRelays: string[],
	{ includeClientTag = false }: PublishOptions = {}
) {
	const emojiTags =
		reaction.type === 'custom'
			? [
					reaction.address
						? ['emoji', reaction.shortcode, reaction.url, reaction.address]
						: ['emoji', reaction.shortcode, reaction.url]
				]
			: [];
	const content = reaction.type === 'unicode' ? reaction.emoji : `:${reaction.shortcode}:`;

	return publishEvent(
		{
			kind: Reaction,
			tags: withClientTag(
				[...createReactionReferenceTags(target, targetReadRelays), ...emojiTags],
				includeClientTag
			),
			content,
			created_at: now()
		},
		pubkey,
		signer,
		targetReadRelays
	);
}
