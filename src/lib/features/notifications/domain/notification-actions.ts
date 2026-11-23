import { Reaction, Repost, ShortTextNote } from 'nostr-tools/kinds';
import type * as Nostr from 'nostr-typedef';
import { extractMentionPubkeys } from '$lib/nostr/mention-tags';
import { decodeProfilePointer } from '$lib/nostr/nip19';
import { isShortTextNoteReplyEvent, getQuoteTags, getLastEventTag } from '$lib/nostr/posts';
import { normalizePubkey } from '$lib/nostr/pubkeys';

export type NotificationType = 'reply' | 'mention' | 'quote' | 'reaction' | 'repost';

export function parseNotificationTarget(value: string) {
	const input = value.trim();
	return /^npub1/i.test(input) ? normalizePubkey(decodeProfilePointer(input)?.pubkey) : null;
}

export function classifyNotification(
	event: Nostr.Event,
	pubkey: string,
	includeOwnEvents: boolean,
	getEvent: (id: string) => Nostr.Event | undefined
) {
	const types: NotificationType[] = [];
	const relatedEventIds = new Set<string>();
	if (
		(!includeOwnEvents && event.pubkey === pubkey) ||
		!event.tags.some(([name, value]) => name === 'p' && value === pubkey)
	) {
		return { types, relatedEventIds: [] };
	}

	function referencesTarget(id: string) {
		const referenced = getEvent(id);
		return !referenced || referenced.pubkey === pubkey;
	}

	if (event.kind === ShortTextNote) {
		if (isShortTextNoteReplyEvent(event)) {
			types.push('reply');
		}
		if (extractMentionPubkeys(event.content).includes(pubkey)) {
			types.push('mention');
		}
		for (const [, id] of getQuoteTags(event)) {
			if (referencesTarget(id)) {
				relatedEventIds.add(id);
			}
		}
		if (relatedEventIds.size > 0) {
			types.push('quote');
		}
	} else if (event.kind === Reaction || event.kind === Repost) {
		const id = getLastEventTag(event)?.[1];
		if (id && referencesTarget(id)) {
			types.push(event.kind === Reaction ? 'reaction' : 'repost');
		}
	}

	return { types, relatedEventIds: [...relatedEventIds] };
}
