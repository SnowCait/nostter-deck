import { describe, expect, test } from 'vitest';
import { Repost, ShortTextNote } from 'nostr-tools/kinds';
import type * as Nostr from 'nostr-typedef';
import {
	buildNip10ReplyTags,
	getPostLikeTarget,
	getPostReplyTarget,
	getPostRepostTarget
} from './post-actions';
import type { Post } from './types';
import { eventToPost } from '$lib/nostr/posts';

const rootPubkey = 'b'.repeat(64);
const replyPubkey = 'c'.repeat(64);
const mentionedPubkey = 'd'.repeat(64);
const targetRelay = 'wss://target.example/';
const rootRelay = 'wss://root.example/';
const mentionedRelay = 'wss://mentioned.example/';

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
	});

	test('builds direct NIP-10 reply tags with a root event and target pubkey', () => {
		const target = eventWithPatch('5'.repeat(64), { pubkey: replyPubkey });

		expect(buildNip10ReplyTags(target, [targetRelay])).toEqual([
			['e', target.id, targetRelay, 'root', replyPubkey],
			['p', replyPubkey, targetRelay]
		]);
	});

	test('builds nested NIP-10 reply tags with root before reply', () => {
		const rootId = '6'.repeat(64);
		const target = eventWithPatch('7'.repeat(64), {
			pubkey: replyPubkey,
			tags: [
				['e', rootId, rootRelay, 'root', rootPubkey],
				['e', '8'.repeat(64), 'wss://parent.example/', 'reply', 'e'.repeat(64)],
				['p', rootPubkey, rootRelay],
				['p', mentionedPubkey, mentionedRelay],
				['p', replyPubkey, 'wss://duplicate.example/']
			]
		});

		expect(buildNip10ReplyTags(target, [targetRelay])).toEqual([
			['e', rootId, rootRelay, 'root', rootPubkey],
			['e', target.id, targetRelay, 'reply', replyPubkey],
			['p', replyPubkey, targetRelay],
			['p', rootPubkey, rootRelay],
			['p', mentionedPubkey, mentionedRelay]
		]);
	});

	test('uses the first legacy e tag as the root when reply markers are absent', () => {
		const rootId = '9'.repeat(64);
		const target = eventWithPatch('a'.repeat(64), {
			pubkey: replyPubkey,
			tags: [
				['e', rootId, rootRelay],
				['e', 'b'.repeat(64), 'wss://previous.example/']
			]
		});

		expect(buildNip10ReplyTags(target, [targetRelay])).toEqual([
			['e', rootId, rootRelay, 'root'],
			['e', target.id, targetRelay, 'reply', replyPubkey],
			['p', replyPubkey, targetRelay]
		]);
	});
});
