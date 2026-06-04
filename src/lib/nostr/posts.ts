import { ShortTextNote } from 'nostr-tools/kinds';
import type * as Nostr from 'nostr-typedef';
import type { Post } from '$lib/deck/types';

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

export function eventToPost(event: Nostr.Event, profile?: Nostr.Content.Metadata): Post {
	return createPost(event, profile);
}

export function repostEventToPost(
	repostEvent: Nostr.Event,
	repostedEvent: Nostr.Event | undefined,
	getProfile: (pubkey: string) => Nostr.Content.Metadata | undefined
): Post {
	const repostProfile = getProfile(repostEvent.pubkey);
	const repostAuthor = createPostAuthor(repostEvent.pubkey, repostProfile);
	const context = {
		icon: 'repost',
		message: {
			key: 'reposted_by',
			params: { name: repostAuthor.author }
		}
	} satisfies NonNullable<Post['context']>;

	if (!repostedEvent || repostedEvent.kind !== ShortTextNote) {
		return {
			...createPost(repostEvent, repostProfile),
			body: '',
			tags: [],
			context,
			unavailableMessage: { key: 'reposted_event_unavailable' }
		};
	}

	return {
		...createPost(repostedEvent, getProfile(repostedEvent.pubkey)),
		id: repostEvent.id,
		time: formatRelativeTime(repostEvent.created_at),
		context
	};
}

export function reactionEventToPost(
	reactionEvent: Nostr.Event,
	reactedEvent: Nostr.Event | undefined,
	getProfile: (pubkey: string) => Nostr.Content.Metadata | undefined
): Post {
	const reactionProfile = getProfile(reactionEvent.pubkey);
	const reactionContent = getReactionContent(reactionEvent);
	const reactionAuthor = createPostAuthor(reactionEvent.pubkey, reactionProfile);
	const context = {
		icon: 'heart',
		message: isLikeReaction(reactionEvent.content)
			? {
					key: 'reacted_by_like',
					params: { name: reactionAuthor.author }
				}
			: {
					key: 'reacted_by',
					params: { name: reactionAuthor.author, content: reactionContent }
				}
	} satisfies NonNullable<Post['context']>;

	if (!reactedEvent || reactedEvent.kind !== ShortTextNote) {
		return {
			...createPost(reactionEvent, reactionProfile),
			body: '',
			tags: [],
			context,
			unavailableMessage: { key: 'reaction_event_unavailable' }
		};
	}

	return {
		...createPost(reactedEvent, getProfile(reactedEvent.pubkey)),
		id: reactionEvent.id,
		time: formatRelativeTime(reactionEvent.created_at),
		context
	};
}

function createPost(event: Nostr.Event, profile?: Nostr.Content.Metadata): Post {
	const author = createPostAuthor(event.pubkey, profile);

	return {
		id: event.id,
		...author,
		time: formatRelativeTime(event.created_at),
		body: event.content,
		tags: getDisplayHashtags(event.tags),
		verified: false,
		stats: {
			replies: '0',
			reposts: '0',
			likes: '0'
		}
	};
}

function getReactionContent(event: Nostr.Event) {
	return isLikeReaction(event.content) ? '+' : event.content;
}

function isLikeReaction(content: string) {
	return content.trim() === '' || content.trim() === '+';
}

function getDisplayHashtags(tags: Nostr.Event['tags']) {
	const displayHashtags = tags.flatMap((tag) => (tag[0] === 't' && tag[1] ? [`#${tag[1]}`] : []));
	return [...new Set(displayHashtags)];
}

function createPostAuthor(pubkey: string, profile?: Nostr.Content.Metadata) {
	const displayName = profile?.display_name ?? profile?.name;

	return {
		author: displayName || shortenPubkey(pubkey),
		handle: shortenPubkey(pubkey),
		avatarUrl: profile?.picture,
		accent: accentClasses[hashString(pubkey) % accentClasses.length]
	};
}

function shortenPubkey(pubkey: string) {
	return `${pubkey.slice(0, 8)}:${pubkey.slice(-4)}`;
}

function formatRelativeTime(createdAt: number) {
	const elapsedSeconds = Math.max(0, Math.floor(Date.now() / 1000) - createdAt);
	if (elapsedSeconds < 60) return `${elapsedSeconds}s`;

	const elapsedMinutes = Math.floor(elapsedSeconds / 60);
	if (elapsedMinutes < 60) return `${elapsedMinutes}m`;

	const elapsedHours = Math.floor(elapsedMinutes / 60);
	if (elapsedHours < 24) return `${elapsedHours}h`;

	return `${Math.floor(elapsedHours / 24)}d`;
}

function hashString(value: string) {
	let hash = 0;
	for (const character of value) {
		hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
	}

	return hash;
}
