import { describe, expect, test } from 'vitest';
import { ChannelMessage, Reaction, Repost, ShortTextNote } from 'nostr-tools/kinds';
import type * as Nostr from 'nostr-typedef';
import { eventToPost, getThreadReference, reactionEventToPost, repostEventToPost } from './posts';

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
			pubkey: targetPubkey,
			author: 'Bob',
			contexts: [
				{
					icon: 'heart',
					message: {
						key: 'reacted_by_like',
						params: { name: 'Alice' }
					}
				}
			]
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
			contexts: [
				{
					icon: 'heart',
					message: {
						key: 'reacted_by',
						params: { name: 'Alice', content: '👀' }
					}
				}
			]
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
			contexts: [
				{
					icon: 'heart',
					message: {
						key: 'reacted_by_like',
						params: { name: 'Alice' }
					}
				}
			],
			unavailableMessage: { key: 'reaction_event_unavailable' }
		});
	});

	test('keeps reply context when formatting a reaction target', () => {
		const reaction = event({
			id: '2'.repeat(64),
			pubkey: reactionPubkey,
			kind: Reaction,
			content: '+'
		});

		expect(
			reactionEventToPost(
				reaction,
				event({ tags: [['e', '4'.repeat(64), '', 'reply']] }),
				getProfile
			)
		).toMatchObject({
			contexts: [
				{
					icon: 'heart',
					message: {
						key: 'reacted_by_like',
						params: { name: 'Alice' }
					}
				},
				{
					icon: 'reply',
					message: { key: 'replying_to' }
				}
			]
		});
	});

	test('formats channel message reaction targets', () => {
		const reaction = event({
			id: '2'.repeat(64),
			pubkey: reactionPubkey,
			kind: Reaction,
			content: '+'
		});

		expect(
			reactionEventToPost(reaction, event({ kind: ChannelMessage }), getProfile)
		).toMatchObject({
			body: 'Target note',
			author: 'Bob',
			contexts: [
				{
					icon: 'heart',
					message: {
						key: 'reacted_by_like',
						params: { name: 'Alice' }
					}
				}
			]
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
			contexts: [
				{
					icon: 'repost',
					message: {
						key: 'reposted_by',
						params: { name: 'Carol' }
					}
				}
			]
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
			contexts: [
				{
					icon: 'repost',
					message: {
						key: 'reposted_by',
						params: { name: 'Carol' }
					}
				}
			],
			unavailableMessage: { key: 'reposted_event_unavailable' }
		});
	});

	test('keeps reply context when formatting a repost target', () => {
		const repost = event({
			id: '3'.repeat(64),
			pubkey: repostPubkey,
			kind: Repost,
			content: ''
		});

		expect(
			repostEventToPost(repost, event({ tags: [['e', '4'.repeat(64), '', 'reply']] }), getProfile)
		).toMatchObject({
			contexts: [
				{
					icon: 'repost',
					message: {
						key: 'reposted_by',
						params: { name: 'Carol' }
					}
				},
				{
					icon: 'reply',
					message: { key: 'replying_to' }
				}
			]
		});
	});

	test('formats channel message repost targets', () => {
		const repost = event({
			id: '3'.repeat(64),
			pubkey: repostPubkey,
			kind: Repost,
			content: ''
		});

		expect(repostEventToPost(repost, event({ kind: ChannelMessage }), getProfile)).toMatchObject({
			body: 'Target note',
			author: 'Bob',
			contexts: [
				{
					icon: 'repost',
					message: {
						key: 'reposted_by',
						params: { name: 'Carol' }
					}
				}
			]
		});
	});

	test('marks NIP-10 reply tags as replies', () => {
		expect(eventToPost(event({ tags: [['e', '4'.repeat(64), '', 'reply']] }))).toMatchObject({
			contexts: [{ icon: 'reply', message: { key: 'replying_to' } }]
		});
	});

	test('marks NIP-10 root tags as replies', () => {
		expect(eventToPost(event({ tags: [['e', '4'.repeat(64), '', 'root']] }))).toMatchObject({
			contexts: [{ icon: 'reply', message: { key: 'replying_to' } }]
		});
	});

	test('treats unmarked e tags as deprecated reply tags', () => {
		expect(eventToPost(event({ tags: [['e', '4'.repeat(64)]] }))).toMatchObject({
			contexts: [{ icon: 'reply', message: { key: 'replying_to' } }]
		});
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

	test('does not treat q tags as replies', () => {
		expect(eventToPost(event({ tags: [['q', '4'.repeat(64)]] }))).not.toHaveProperty('contexts');
	});

	test('formats channel messages as posts', () => {
		expect(eventToPost(event({ kind: ChannelMessage }), getProfile(targetPubkey))).toMatchObject({
			body: 'Target note',
			author: 'Bob'
		});
	});

	test('does not treat channel root tags as replies', () => {
		expect(
			eventToPost(event({ kind: ChannelMessage, tags: [['e', '4'.repeat(64), '', 'root']] }))
		).not.toHaveProperty('contexts');
	});

	test('marks channel reply tags as replies', () => {
		expect(
			eventToPost(event({ kind: ChannelMessage, tags: [['e', '4'.repeat(64), '', 'reply']] }))
		).toMatchObject({
			contexts: [{ icon: 'reply', message: { key: 'replying_to' } }]
		});
	});

	test('marks the second channel e tag as a reply', () => {
		expect(
			eventToPost(
				event({
					kind: ChannelMessage,
					tags: [
						['e', '4'.repeat(64), '', 'root'],
						['e', '5'.repeat(64)]
					]
				})
			)
		).toMatchObject({
			contexts: [{ icon: 'reply', message: { key: 'replying_to' } }]
		});
	});

	test('does not treat channel q tags as replies', () => {
		expect(
			eventToPost(event({ kind: ChannelMessage, tags: [['q', '4'.repeat(64)]] }))
		).not.toHaveProperty('contexts');
	});
});
