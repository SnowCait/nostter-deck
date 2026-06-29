import { describe, expect, test } from 'vitest';
import { Repost, ShortTextNote } from 'nostr-tools/kinds';
import type * as Nostr from 'nostr-typedef';
import { getPostLikeTarget, getPostRepostTarget } from './post-actions';
import type { Post } from './types';
import { eventToPost } from '$lib/nostr/posts';

function event(id: string, kind = ShortTextNote) {
	return {
		id,
		pubkey: 'a'.repeat(64),
		created_at: 100,
		kind,
		tags: [],
		content: id,
		sig: '0'.repeat(128)
	} satisfies Nostr.Event;
}

describe('post actions', () => {
	test('uses the post source event for direct posts', () => {
		const source = event('1'.repeat(64));

		expect(getPostLikeTarget(eventToPost(source))).toBe(source);
		expect(getPostRepostTarget(eventToPost(source))).toBe(source);
	});

	test('uses the referenced event for repost and reaction cards', () => {
		const source = event('2'.repeat(64), Repost);
		const referenced = event('3'.repeat(64));
		const post = {
			...eventToPost(referenced),
			events: { source, referenced },
			referenceType: 'repost'
		} satisfies Post;

		expect(getPostLikeTarget(post)).toBe(referenced);
		expect(getPostRepostTarget(post)).toBe(referenced);
	});

	test('does not expose a like target while a referenced event is unavailable', () => {
		const source = event('4'.repeat(64), Repost);
		const post = {
			...eventToPost(source),
			events: { source },
			referenceType: 'repost',
			referenceStatus: 'unavailable'
		} satisfies Post;

		expect(getPostLikeTarget(post)).toBeNull();
		expect(getPostRepostTarget(post)).toBeNull();
	});
});
