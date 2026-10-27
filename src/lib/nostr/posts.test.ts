import { describe, expect, test } from 'vitest';
import { ShortTextNote } from 'nostr-tools/kinds';
import type * as Nostr from 'nostr-typedef';
import { getContentWarning, getReferencedPubkey, getThreadReference } from './posts';

const reactionPubkey = 'a'.repeat(64);
const targetPubkey = 'b'.repeat(64);

function event(patch: Partial<Nostr.Event>): Nostr.Event {
	return {
		id: '1'.repeat(64),
		pubkey: targetPubkey,
		created_at: 100,
		kind: ShortTextNote,
		tags: [],
		content: 'Target note',
		sig: '0'.repeat(128),
		...patch
	};
}

describe('post protocol parsing', () => {
	test('extracts the first NIP-36 content warning', () => {
		expect(
			getContentWarning([
				['content-warning', ' violence '],
				['content-warning', 'spoiler']
			])
		).toEqual({ reason: 'violence' });
	});

	test.each([{ tags: [['content-warning']] }, { tags: [['content-warning', '   ']] }])(
		'treats a content-warning tag without a reason as sensitive',
		({ tags }) => {
			expect(getContentWarning(tags)).toEqual({});
		}
	);

	test('ignores NIP-32 labels and unrelated tags', () => {
		expect(
			getContentWarning([
				['L', 'content-warning'],
				['l', 'nudity', 'content-warning'],
				['t', 'sensitive']
			])
		).toBeNull();
	});

	test('uses the last valid p tag as the referenced pubkey', () => {
		expect(
			getReferencedPubkey(
				event({
					tags: [
						['p', reactionPubkey],
						['p', 'invalid'],
						['p', targetPubkey.toUpperCase()]
					]
				})
			)
		).toBe(targetPubkey);
	});

	test('resolves marked NIP-10 root and parent references', () => {
		const rootId = '4'.repeat(64);
		const parentId = '5'.repeat(64);
		const reply = event({
			tags: [
				['e', rootId, 'wss://root.example/', 'root'],
				['e', parentId, 'wss://parent.example/', 'reply']
			]
		});

		expect(getThreadReference(reply)).toEqual({
			event: reply,
			rootId,
			parentId,
			relayHints: ['wss://root.example/', 'wss://parent.example/']
		});
	});

	test('resolves deprecated NIP-10 first-root and last-parent references', () => {
		const rootId = '4'.repeat(64);
		const parentId = '5'.repeat(64);
		const reply = event({
			tags: [
				['e', rootId],
				['e', parentId]
			]
		});

		expect(getThreadReference(reply)).toMatchObject({ rootId, parentId });
	});
});
