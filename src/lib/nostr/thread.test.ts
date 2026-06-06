import { describe, expect, test } from 'vitest';
import { ShortTextNote } from 'nostr-tools/kinds';
import type * as Nostr from 'nostr-typedef';
import { buildThreadEvents } from './thread';

function event(id: string, createdAt: number, tags: Nostr.Event['tags'] = []): Nostr.Event {
	return {
		id,
		pubkey: 'a'.repeat(64),
		created_at: createdAt,
		kind: ShortTextNote,
		tags,
		content: id,
		sig: '0'.repeat(128)
	};
}

describe('thread', () => {
	test('orders a NIP-10 tree by parent and chronological sibling order', () => {
		const root = event('1'.repeat(64), 100);
		const laterReply = event('2'.repeat(64), 300, [
			['e', root.id, '', 'root'],
			['e', root.id, '', 'reply']
		]);
		const earlierReply = event('3'.repeat(64), 200, [
			['e', root.id, '', 'root'],
			['e', root.id, '', 'reply']
		]);
		const nestedReply = event('4'.repeat(64), 400, [
			['e', root.id, '', 'root'],
			['e', earlierReply.id, '', 'reply']
		]);

		expect(buildThreadEvents([nestedReply, laterReply, root, earlierReply], root.id)).toEqual([
			{ event: root, depth: 0 },
			{ event: earlierReply, depth: 1 },
			{ event: nestedReply, depth: 2 },
			{ event: laterReply, depth: 1 }
		]);
	});

	test('shows orphaned events once when the root is unavailable', () => {
		const rootId = '1'.repeat(64);
		const reply = event('2'.repeat(64), 200, [['e', rootId, '', 'root']]);

		expect(buildThreadEvents([reply, reply], rootId)).toEqual([{ event: reply, depth: 0 }]);
	});
});
