import { describe, expect, test } from 'vitest';
import { ShortTextNote } from 'nostr-tools/kinds';
import { decode } from 'nostr-tools/nip19';
import type * as Nostr from 'nostr-typedef';
import { buildNip10ReplyTags, buildNip18QuoteRepost } from './post-tags';

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

describe('post tags', () => {
	test('builds direct NIP-10 reply tags with a root event and target pubkey', () => {
		const target = eventWithPatch('9'.repeat(64), { pubkey: replyPubkey });

		expect(buildNip10ReplyTags(target, [targetRelay])).toEqual([
			['e', target.id, targetRelay, 'root', replyPubkey],
			['p', replyPubkey, targetRelay]
		]);
	});

	test('builds nested NIP-10 reply tags with root before reply', () => {
		const rootId = 'a'.repeat(64);
		const target = eventWithPatch('b'.repeat(64), {
			pubkey: replyPubkey,
			tags: [
				['e', rootId, rootRelay, 'root', rootPubkey],
				['e', 'c'.repeat(64), 'wss://parent.example/', 'reply', 'e'.repeat(64)],
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
		const rootId = 'd'.repeat(64);
		const target = eventWithPatch('e'.repeat(64), {
			pubkey: replyPubkey,
			tags: [
				['e', rootId, rootRelay],
				['e', 'f'.repeat(64), 'wss://previous.example/']
			]
		});

		expect(buildNip10ReplyTags(target, [targetRelay])).toEqual([
			['e', rootId, rootRelay, 'root'],
			['e', target.id, targetRelay, 'reply', replyPubkey],
			['p', replyPubkey, targetRelay]
		]);
	});

	test('builds NIP-18 quote repost content and q tag with a relay hint', () => {
		const target = eventWithPatch('c'.repeat(64), { pubkey: replyPubkey });
		const result = buildNip18QuoteRepost('Quote this  ', target, [targetRelay]);
		const reference = result.content.split('\n\n').at(-1);

		expect(result.tags).toEqual([['q', target.id, targetRelay, replyPubkey]]);
		expect(result.content).toMatch(/^Quote this\n\nnostr:nevent/);
		expect(reference).toBeDefined();

		const decoded = decode(reference!.replace(/^nostr:/, ''));
		expect(decoded).toMatchObject({
			type: 'nevent',
			data: { id: target.id, author: replyPubkey, kind: ShortTextNote, relays: [targetRelay] }
		});
	});

	test('builds NIP-18 quote repost tags without relay hints', () => {
		const target = eventWithPatch('d'.repeat(64), { pubkey: replyPubkey });
		const result = buildNip18QuoteRepost('Quote this', target, []);

		expect(result.tags).toEqual([['q', target.id, '', replyPubkey]]);
		expect(result.content).toContain('\n\nnostr:nevent');
	});
});
