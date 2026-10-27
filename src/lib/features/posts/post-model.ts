import { ChannelMessage, ShortTextNote } from 'nostr-tools/kinds';
import type * as Nostr from 'nostr-typedef';
import type { Post, PostContext } from './types';
import { parseCustomEmojis } from '$lib/nostr/custom-emoji';
import { getProfileDisplayName, type Profile } from '$lib/nostr/profiles';
import {
	getContentWarning,
	getReferencedPubkey,
	getThreadReference,
	isReplyEvent
} from '$lib/nostr/posts';

const accentClasses = [
	'bg-sky-500',
	'bg-violet-500',
	'bg-emerald-500',
	'bg-amber-500',
	'bg-rose-500',
	'bg-blue-600',
	'bg-fuchsia-500',
	'bg-orange-500'
];

export function eventToPost(event: Nostr.Event, profile?: Profile): Post {
	return createPost(event, profile);
}

export function repostEventToPost(
	repostEvent: Nostr.Event,
	repostedEvent: Nostr.Event | undefined,
	getProfile: (pubkey: string) => Profile | undefined
): Post {
	const repostProfile = getProfile(repostEvent.pubkey);
	const repostAuthor = createPostAuthor(repostEvent.pubkey, repostProfile);
	const mutePubkeys = getReferenceMutePubkeys(repostEvent, repostedEvent);
	const context = {
		icon: 'repost',
		message: {
			key: 'reposted_by',
			params: { name: repostAuthor.author },
			nameEmojis: repostAuthor.authorEmojis
		}
	} satisfies PostContext;

	if (!repostedEvent || !isTextLikePostEvent(repostedEvent)) {
		return {
			...createPost(repostEvent, repostProfile),
			body: '',
			mutePubkeys,
			referenceType: 'repost',
			contexts: [context],
			unavailableMessage: { key: 'reposted_event_unavailable' }
		};
	}

	const repostedPost = createPost(repostedEvent, getProfile(repostedEvent.pubkey));

	return {
		...repostedPost,
		id: repostEvent.id,
		events: { source: repostEvent, referenced: repostedEvent },
		time: formatRelativeTime(repostEvent.created_at),
		mutePubkeys,
		referenceType: 'repost',
		contexts: [context, ...(repostedPost.contexts ?? [])]
	};
}

export function reactionEventToPost(
	reactionEvent: Nostr.Event,
	reactedEvent: Nostr.Event | undefined,
	getProfile: (pubkey: string) => Profile | undefined
): Post {
	const reactionProfile = getProfile(reactionEvent.pubkey);
	const reactionContent = getReactionContent(reactionEvent);
	const reactionAuthor = createPostAuthor(reactionEvent.pubkey, reactionProfile);
	const mutePubkeys = getReferenceMutePubkeys(reactionEvent, reactedEvent);
	const context = {
		icon: 'heart',
		message: isLikeReaction(reactionEvent.content)
			? {
					key: 'reacted_by_like',
					params: { name: reactionAuthor.author },
					nameEmojis: reactionAuthor.authorEmojis
				}
			: {
					key: 'reacted_by',
					params: { name: reactionAuthor.author, content: reactionContent },
					nameEmojis: reactionAuthor.authorEmojis,
					contentEmojis: parseCustomEmojis(reactionEvent.tags)
				}
	} satisfies PostContext;

	if (!reactedEvent || !isTextLikePostEvent(reactedEvent)) {
		return {
			...createPost(reactionEvent, reactionProfile),
			body: '',
			mutePubkeys,
			referenceType: 'reaction',
			contexts: [context],
			unavailableMessage: { key: 'reaction_event_unavailable' }
		};
	}

	const reactedPost = createPost(reactedEvent, getProfile(reactedEvent.pubkey));

	return {
		...reactedPost,
		id: reactionEvent.id,
		events: { source: reactionEvent, referenced: reactedEvent },
		time: formatRelativeTime(reactionEvent.created_at),
		mutePubkeys,
		referenceType: 'reaction',
		contexts: [context, ...(reactedPost.contexts ?? [])]
	};
}

function createPost(event: Nostr.Event, profile?: Profile): Post {
	const author = createPostAuthor(event.pubkey, profile);
	const contexts = getReplyContexts(event);
	const thread = getThreadReference(event);
	const contentWarning = getContentWarning(event.tags);

	return {
		id: event.id,
		events: { source: event },
		...author,
		time: formatRelativeTime(event.created_at),
		body: event.content,
		bodyEmojis:
			event.kind === ShortTextNote || event.kind === ChannelMessage
				? parseCustomEmojis(event.tags)
				: [],
		mutePubkeys: [event.pubkey],
		...(contentWarning ? { contentWarning } : {}),
		verified: false,
		stats: {
			replies: '0',
			reposts: '0',
			likes: '0'
		},
		...(contexts.length > 0 ? { contexts } : {}),
		...(thread ? { thread } : {})
	};
}

function getReferenceMutePubkeys(referenceEvent: Nostr.Event, referencedEvent?: Nostr.Event) {
	return [
		...new Set(
			[
				referenceEvent.pubkey,
				referencedEvent?.pubkey ?? getReferencedPubkey(referenceEvent)
			].flatMap((pubkey) => (pubkey ? [pubkey.toLowerCase()] : []))
		)
	];
}

function getReplyContexts(event: Nostr.Event): PostContext[] {
	return isReplyEvent(event) ? [{ icon: 'reply', message: { key: 'replying_to' } }] : [];
}

function isTextLikePostEvent(event: Nostr.Event) {
	return event.kind === ShortTextNote || event.kind === ChannelMessage;
}

function getReactionContent(event: Nostr.Event) {
	return isLikeReaction(event.content) ? '+' : event.content;
}

function isLikeReaction(content: string) {
	return content.trim() === '' || content.trim() === '+';
}

function createPostAuthor(pubkey: string, profile?: Profile) {
	const fallbackName = getProfileDisplayName(undefined, pubkey);

	return {
		pubkey,
		author: getProfileDisplayName(profile, pubkey),
		handle: fallbackName,
		avatarUrl: profile?.picture,
		authorEmojis: profile?.customEmojis ?? [],
		accent: accentClasses[hashString(pubkey) % accentClasses.length]
	};
}

function formatRelativeTime(createdAt: number) {
	const elapsedSeconds = Math.max(0, Math.floor(Date.now() / 1000) - createdAt);
	if (elapsedSeconds < 60) {
		return `${elapsedSeconds}s`;
	}

	const elapsedMinutes = Math.floor(elapsedSeconds / 60);
	if (elapsedMinutes < 60) {
		return `${elapsedMinutes}m`;
	}

	const elapsedHours = Math.floor(elapsedMinutes / 60);
	if (elapsedHours < 24) {
		return `${elapsedHours}h`;
	}

	return `${Math.floor(elapsedHours / 24)}d`;
}

function hashString(value: string) {
	let hash = 0;
	for (const character of value) {
		hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
	}

	return hash;
}
