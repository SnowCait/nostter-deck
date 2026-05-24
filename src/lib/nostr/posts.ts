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
	const displayName = profile?.display_name ?? profile?.name;

	return {
		id: event.id,
		author: displayName || shortenPubkey(event.pubkey),
		handle: shortenPubkey(event.pubkey),
		avatarUrl: profile?.picture,
		time: formatRelativeTime(event.created_at),
		body: event.content,
		accent: accentClasses[hashString(event.pubkey) % accentClasses.length],
		tags: event.tags.flatMap((tag) => (tag[0] === 't' && tag[1] ? [`#${tag[1]}`] : [])),
		verified: false,
		stats: {
			replies: '0',
			reposts: '0',
			likes: '0'
		}
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
