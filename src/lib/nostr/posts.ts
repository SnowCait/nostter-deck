import { ChannelMessage, ShortTextNote } from 'nostr-tools/kinds';
import type * as Nostr from 'nostr-typedef';

export type ContentWarning = { reason?: string };

export type ThreadReference = {
	event: Nostr.Event;
	rootId: string;
	parentId?: string;
	relayHints: string[];
};

export function getContentWarning(tags: Nostr.Event['tags']): ContentWarning | null {
	const tag = tags.find(([name]) => name === 'content-warning');
	if (!tag) {
		return null;
	}

	const reason = tag[1]?.trim();
	return reason ? { reason } : {};
}

export function getReferencedPubkey(event: Nostr.Event) {
	for (let index = event.tags.length - 1; index >= 0; index -= 1) {
		const tag = event.tags[index];
		if (tag[0] === 'p' && tag[1] && /^[0-9a-f]{64}$/i.test(tag[1])) {
			return tag[1].toLowerCase();
		}
	}

	return null;
}

export function getThreadReference(event: Nostr.Event): ThreadReference | null {
	if (event.kind !== ShortTextNote) {
		return null;
	}

	const eventTags = event.tags.filter((tag) => tag[0] === 'e' && tag[1]);
	if (eventTags.length === 0) {
		return { event, rootId: event.id, relayHints: [] };
	}

	const rootTag = eventTags.find((tag) => tag[3] === 'root');
	const replyTag = eventTags.findLast((tag) => tag[3] === 'reply');
	const hasMarkers = eventTags.some((tag) => tag[3] === 'root' || tag[3] === 'reply');
	const resolvedRootTag = rootTag ?? (hasMarkers ? replyTag : eventTags[0]);
	const resolvedReplyTag = replyTag ?? (eventTags.length > 1 ? eventTags.at(-1) : undefined);
	const relayHints = eventTags.flatMap((tag) => (tag[2] ? [tag[2]] : []));

	return {
		event,
		rootId: resolvedRootTag?.[1] ?? event.id,
		...(resolvedReplyTag?.[1] && resolvedReplyTag[1] !== event.id
			? { parentId: resolvedReplyTag[1] }
			: {}),
		relayHints: [...new Set(relayHints)]
	};
}

export function isReplyEvent(event: Nostr.Event) {
	if (event.kind === ShortTextNote) {
		return isShortTextNoteReplyEvent(event);
	}
	if (event.kind === ChannelMessage) {
		return isChannelMessageReplyEvent(event);
	}

	return false;
}

export function isShortTextNoteReplyEvent(event: Nostr.Event) {
	const eventTags = event.tags.filter((tag) => tag[0] === 'e' && tag[1]);
	if (eventTags.length === 0) {
		return false;
	}

	const markedEventTags = eventTags.filter((tag) => tag[3]);
	if (markedEventTags.length > 0) {
		return markedEventTags.some((tag) => tag[3] === 'reply' || tag[3] === 'root');
	}

	return true;
}

function isChannelMessageReplyEvent(event: Nostr.Event) {
	const eventTags = event.tags.filter((tag) => tag[0] === 'e' && tag[1]);
	if (eventTags.length === 0) {
		return false;
	}

	return eventTags.some((tag) => tag[3] === 'reply') || eventTags.length >= 2;
}
