import { Repost, ShortTextNote } from 'nostr-tools/kinds';
import { finalizeEvent, generateSecretKey } from 'nostr-tools/pure';
import type * as Nostr from 'nostr-typedef';
import { describe, expect, test } from 'vitest';
import { getVerifiedEmbeddedRepostedEvent } from './reposts';

function signedTextNote(content = 'Reposted note'): Nostr.Event {
	return finalizeEvent(
		{
			kind: ShortTextNote,
			created_at: 100,
			tags: [],
			content
		},
		generateSecretKey()
	);
}

function repostWithContent(target: Nostr.Event, content = JSON.stringify(target)): Nostr.Event {
	return finalizeEvent(
		{
			kind: Repost,
			created_at: 200,
			tags: [
				['e', target.id],
				['p', target.pubkey]
			],
			content
		},
		generateSecretKey()
	);
}

describe('NIP-18 reposts', () => {
	test('accepts a signed embedded repost target that matches the e tag', () => {
		const target = signedTextNote();
		const repost = repostWithContent(target);

		expect(getVerifiedEmbeddedRepostedEvent(repost)).toMatchObject({
			id: target.id,
			pubkey: target.pubkey,
			created_at: target.created_at,
			kind: target.kind,
			tags: target.tags,
			content: target.content,
			sig: target.sig
		});
	});

	test('rejects an embedded repost target whose id does not match the e tag', () => {
		const target = signedTextNote();
		const repost = {
			...repostWithContent(target),
			tags: [
				['e', 'f'.repeat(64)],
				['p', target.pubkey]
			]
		};

		expect(getVerifiedEmbeddedRepostedEvent(repost)).toBeNull();
	});

	test('rejects an embedded repost target with a tampered signature hash', () => {
		const target = signedTextNote();
		const repost = repostWithContent(
			target,
			JSON.stringify({ ...target, content: 'Tampered note' })
		);

		expect(getVerifiedEmbeddedRepostedEvent(repost)).toBeNull();
	});

	test('rejects empty and invalid embedded repost content', () => {
		const target = signedTextNote();

		expect(getVerifiedEmbeddedRepostedEvent(repostWithContent(target, ''))).toBeNull();
		expect(getVerifiedEmbeddedRepostedEvent(repostWithContent(target, '{'))).toBeNull();
	});
});
