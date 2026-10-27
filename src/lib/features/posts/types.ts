import type * as Nostr from 'nostr-typedef';
import type { CustomEmoji } from '$lib/nostr/custom-emoji';
import type { ContentWarning, ThreadReference } from '$lib/nostr/posts';

export type PostMessage =
	| { key: 'replying_to' }
	| { key: 'reposted_by'; params: { name: string }; nameEmojis: CustomEmoji[] }
	| { key: 'reposted_event_unavailable' }
	| { key: 'reacted_by_like'; params: { name: string }; nameEmojis: CustomEmoji[] }
	| {
			key: 'reacted_by';
			params: { name: string; content: string };
			nameEmojis: CustomEmoji[];
			contentEmojis: CustomEmoji[];
	  }
	| { key: 'reaction_event_unavailable' };

export type PostContext = {
	icon: 'reply' | 'repost' | 'heart';
	message: PostMessage;
};

export type Post = {
	id?: string;
	events: {
		source: Nostr.Event;
		referenced?: Nostr.Event;
	};
	pubkey: string;
	author: string;
	handle: string;
	avatarUrl?: string;
	time: string;
	body: string;
	bodyEmojis: CustomEmoji[];
	authorEmojis: CustomEmoji[];
	accent: string;
	mutePubkeys: string[];
	contentWarning?: ContentWarning;
	referenceType?: 'repost' | 'reaction';
	referenceStatus?: 'loading' | 'loaded' | 'unavailable';
	verified?: boolean;
	stats: {
		replies: string;
		reposts: string;
		likes: string;
	};
	contexts?: PostContext[];
	unavailableMessage?: PostMessage;
	thread?: ThreadReference;
	attachment?: {
		label: string;
		title: string;
		body: string;
	};
};

export type ThreadPost = {
	post: Post;
	depth: number;
	isMuted: boolean;
};
