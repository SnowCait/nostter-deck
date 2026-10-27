import { describe, expect, test } from 'vitest';
import { Repost, ShortTextNote } from 'nostr-tools/kinds';
import { decode } from 'nostr-tools/nip19';
import type * as Nostr from 'nostr-typedef';
import {
	buildPostShareUrl,
	getPostLikeTarget,
	getPostQuoteTarget,
	getPostReplyTarget,
	getPostRepostTarget,
	getPostShareTarget
} from './post-actions';
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

function eventWithPatch(id: string, patch: Partial<Nostr.Event>) {
	return { ...event(id), ...patch } satisfies Nostr.Event;
}

describe('post actions', () => {
	test('uses the post source event for direct posts', () => {
		const source = event('1'.repeat(64));

		expect(getPostLikeTarget(eventToPost(source))).toBe(source);
		expect(getPostRepostTarget(eventToPost(source))).toBe(source);
		expect(getPostReplyTarget(eventToPost(source))).toBe(source);
		expect(getPostQuoteTarget(eventToPost(source))).toBe(source);
		expect(getPostShareTarget(eventToPost(source))).toBe(source);
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
		expect(getPostReplyTarget(post)).toBe(referenced);
		expect(getPostQuoteTarget(post)).toBe(referenced);
		expect(getPostShareTarget(post)).toBe(referenced);
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
		expect(getPostReplyTarget(post)).toBeNull();
		expect(getPostQuoteTarget(post)).toBeNull();
		expect(getPostShareTarget(post)).toBeNull();
	});

	test('builds a nostter nevent share URL for direct posts', () => {
		const source = event('4'.repeat(64));
		const shareUrl = buildPostShareUrl(eventToPost(source));
		const encodedPointer = shareUrl?.replace('https://nostter.app/', '');

		expect(shareUrl).toMatch(/^https:\/\/nostter\.app\/nevent/);
		expect(decode(encodedPointer ?? '')).toMatchObject({
			type: 'nevent',
			data: { id: source.id, author: source.pubkey, kind: ShortTextNote }
		});
	});

	test('builds a nostter naddr share URL for addressable posts', () => {
		const source = eventWithPatch('5'.repeat(64), {
			kind: 30_023,
			tags: [['d', 'article']]
		});
		const shareUrl = buildPostShareUrl(eventToPost(source));
		const encodedPointer = shareUrl?.replace('https://nostter.app/', '');

		expect(shareUrl).toMatch(/^https:\/\/nostter\.app\/naddr/);
		expect(decode(encodedPointer ?? '')).toEqual({
			type: 'naddr',
			data: {
				identifier: 'article',
				pubkey: source.pubkey,
				kind: 30_023,
				relays: []
			}
		});
	});

	test('builds share URLs from referenced events for repost cards', () => {
		const source = event('6'.repeat(64), Repost);
		const referenced = event('7'.repeat(64));
		const post = {
			...eventToPost(referenced),
			events: { source, referenced },
			referenceType: 'repost'
		} satisfies Post;
		const shareUrl = buildPostShareUrl(post);
		const encodedPointer = shareUrl?.replace('https://nostter.app/', '');

		expect(decode(encodedPointer ?? '')).toMatchObject({
			type: 'nevent',
			data: { id: referenced.id, author: referenced.pubkey, kind: ShortTextNote }
		});
	});

	test('does not build a share URL when the target event is unavailable or invalid', () => {
		const source = eventWithPatch('8'.repeat(64), { kind: Repost });
		const unavailablePost = {
			...eventToPost(source),
			events: { source },
			referenceType: 'repost',
			referenceStatus: 'unavailable'
		} satisfies Post;
		const invalidPost = eventToPost(eventWithPatch('invalid', {}));

		expect(buildPostShareUrl(unavailablePost)).toBeNull();
		expect(buildPostShareUrl(invalidPost)).toBeNull();
	});
});
