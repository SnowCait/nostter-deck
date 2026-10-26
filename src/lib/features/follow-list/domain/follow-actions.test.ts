import type * as Nostr from 'nostr-typedef';
import { Contacts } from 'nostr-tools/kinds';
import { describe, expect, test } from 'vitest';
import { addFollow, removeFollow } from './follow-actions';

const followedPubkey = 'a'.repeat(64);
const otherPubkey = 'b'.repeat(64);

function followList(
	tags: string[][] = [],
	content = 'keep this content'
): Nostr.Event<typeof Contacts> {
	return {
		id: 'c'.repeat(64),
		sig: 'd'.repeat(128),
		pubkey: 'e'.repeat(64),
		created_at: 1,
		kind: Contacts,
		tags,
		content
	};
}

describe('follow list actions', () => {
	test('adds a follow after existing tags while preserving their data and order', () => {
		const sourceTags = [
			['p', otherPubkey, 'wss://relay.example/', 'friend', 'extra'],
			['client', 'nostter-deck'],
			['p', followedPubkey, 'wss://old-hint.example/', 'old-name']
		];
		const event = followList(sourceTags);

		expect(addFollow(event, followedPubkey)).toBeNull();
		const added = addFollow(event, 'f'.repeat(64));
		expect(added).toEqual({
			kind: Contacts,
			content: 'keep this content',
			tags: [...sourceTags, ['p', 'f'.repeat(64), '']]
		});
		expect(event.tags).toBe(sourceTags);
		expect(sourceTags).toEqual([
			['p', otherPubkey, 'wss://relay.example/', 'friend', 'extra'],
			['client', 'nostter-deck'],
			['p', followedPubkey, 'wss://old-hint.example/', 'old-name']
		]);
	});

	test('creates the first follow from an empty list', () => {
		expect(addFollow(undefined, followedPubkey)).toEqual({
			kind: Contacts,
			content: '',
			tags: [['p', followedPubkey, '']]
		});
	});

	test('removes all matching p tags while preserving unrelated tags and content', () => {
		const event = followList([
			['p', followedPubkey, 'wss://one.example/', 'first', 'extra'],
			['client', 'nostter-deck'],
			['p', otherPubkey, 'wss://other.example/', 'other'],
			['p', followedPubkey, 'wss://two.example/', 'second']
		]);
		const original = structuredClone(event);

		expect(removeFollow(event, followedPubkey)).toEqual({
			kind: Contacts,
			content: 'keep this content',
			tags: [
				['client', 'nostter-deck'],
				['p', otherPubkey, 'wss://other.example/', 'other']
			]
		});
		expect(event).toEqual(original);
	});

	test('leaves an unchanged or missing follow list alone', () => {
		expect(removeFollow(undefined, followedPubkey)).toBeNull();
		expect(removeFollow(followList([['p', otherPubkey]]), followedPubkey)).toBeNull();
	});
});
