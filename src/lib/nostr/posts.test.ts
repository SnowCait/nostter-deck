import { describe, expect, test } from 'vitest';
import { Reaction, ShortTextNote } from 'nostr-tools/kinds';
import type * as Nostr from 'nostr-typedef';
import { reactionEventToPost } from './posts';

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

function getProfile(pubkey: string): Nostr.Content.Metadata | undefined {
	if (pubkey === reactionPubkey) return { display_name: 'Alice' };
	if (pubkey === targetPubkey) return { display_name: 'Bob' };
	return undefined;
}

describe('posts', () => {
	test.each(['+', ''])('formats %s reaction as a like', (content) => {
		const reaction = event({
			id: '2'.repeat(64),
			pubkey: reactionPubkey,
			kind: Reaction,
			content
		});

		expect(reactionEventToPost(reaction, event({}), getProfile)).toMatchObject({
			body: 'Target note',
			author: 'Bob',
			reactedBy: {
				author: 'Alice',
				content: '+',
				kind: 'like'
			}
		});
	});

	test('formats emoji reaction as a reaction', () => {
		const reaction = event({
			id: '2'.repeat(64),
			pubkey: reactionPubkey,
			kind: Reaction,
			content: '👀'
		});

		expect(reactionEventToPost(reaction, event({}), getProfile)).toMatchObject({
			body: 'Target note',
			reactedBy: {
				author: 'Alice',
				content: '👀',
				kind: 'reaction'
			}
		});
	});

	test('marks unavailable reaction targets', () => {
		const reaction = event({
			id: '2'.repeat(64),
			pubkey: reactionPubkey,
			kind: Reaction,
			content: '+'
		});

		expect(reactionEventToPost(reaction, undefined, getProfile)).toMatchObject({
			body: '',
			isReactionUnavailable: true,
			reactedBy: {
				author: 'Alice',
				kind: 'like'
			}
		});
	});
});
