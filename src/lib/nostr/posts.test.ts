import { describe, expect, test } from 'vitest';
import { Reaction, Repost, ShortTextNote } from 'nostr-tools/kinds';
import type * as Nostr from 'nostr-typedef';
import { reactionEventToPost, repostEventToPost } from './posts';

const reactionPubkey = 'a'.repeat(64);
const targetPubkey = 'b'.repeat(64);
const repostPubkey = 'c'.repeat(64);

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
	if (pubkey === repostPubkey) return { display_name: 'Carol' };
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
			context: {
				icon: 'heart',
				message: {
					key: 'reacted_by_like',
					params: { name: 'Alice' }
				}
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
			context: {
				icon: 'heart',
				message: {
					key: 'reacted_by',
					params: { name: 'Alice', content: '👀' }
				}
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
			context: {
				icon: 'heart',
				message: {
					key: 'reacted_by_like',
					params: { name: 'Alice' }
				}
			},
			unavailableMessage: { key: 'reaction_event_unavailable' }
		});
	});

	test('formats repost context', () => {
		const repost = event({
			id: '3'.repeat(64),
			pubkey: repostPubkey,
			kind: Repost,
			content: ''
		});

		expect(repostEventToPost(repost, event({}), getProfile)).toMatchObject({
			body: 'Target note',
			author: 'Bob',
			context: {
				icon: 'repost',
				message: {
					key: 'reposted_by',
					params: { name: 'Carol' }
				}
			}
		});
	});

	test('marks unavailable repost targets', () => {
		const repost = event({
			id: '3'.repeat(64),
			pubkey: repostPubkey,
			kind: Repost,
			content: ''
		});

		expect(repostEventToPost(repost, undefined, getProfile)).toMatchObject({
			body: '',
			context: {
				icon: 'repost',
				message: {
					key: 'reposted_by',
					params: { name: 'Carol' }
				}
			},
			unavailableMessage: { key: 'reposted_event_unavailable' }
		});
	});
});
