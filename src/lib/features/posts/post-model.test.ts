import { describe, expect, test, vi } from 'vitest';
import { ChannelMessage, Reaction, Repost, ShortTextNote } from 'nostr-tools/kinds';
import { npubEncode } from 'nostr-tools/nip19';
import type * as Nostr from 'nostr-typedef';
import type { Profile } from '$lib/nostr/profiles';
import { eventToPost, reactionEventToPost, repostEventToPost } from './post-model';

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

function getProfile(pubkey: string): Profile | undefined {
	if (pubkey === reactionPubkey) {
		return { display_name: 'Alice', customEmojis: [] };
	}
	if (pubkey === targetPubkey) {
		return { display_name: 'Bob', customEmojis: [] };
	}
	if (pubkey === repostPubkey) {
		return { display_name: 'Carol', customEmojis: [] };
	}
	return undefined;
}

describe('post display models', () => {
	test('adds content warning metadata to posts', () => {
		expect(eventToPost(event({ tags: [['content-warning', 'spoiler']] }))).toMatchObject({
			contentWarning: { reason: 'spoiler' }
		});
	});

	test('keeps the source event for JSON inspection', () => {
		const source = event({
			tags: [['t', 'nostter']],
			content: 'Raw source content'
		});

		expect(eventToPost(source).events).toEqual({ source });
		expect(eventToPost(source).events.source).toBe(source);
	});

	test('uses the resolved author instead of the hinted author for reference mute candidates', () => {
		const repost = event({
			pubkey: repostPubkey,
			kind: Repost,
			tags: [['p', reactionPubkey]]
		});

		expect(
			repostEventToPost(repost, event({ pubkey: targetPubkey }), getProfile).mutePubkeys
		).toEqual([repostPubkey, targetPubkey]);
		expect(repostEventToPost(repost, undefined, getProfile).mutePubkeys).toEqual([
			repostPubkey,
			reactionPubkey
		]);
	});

	test('falls back to name when display_name is empty', () => {
		const emptyDisplayNameTarget: Profile = {
			display_name: '',
			name: 'Named Target',
			customEmojis: []
		};
		const reaction = event({
			id: '2'.repeat(64),
			pubkey: reactionPubkey,
			kind: Reaction,
			content: '+'
		});
		const repost = event({
			id: '3'.repeat(64),
			pubkey: repostPubkey,
			kind: Repost
		});
		const getProfileWithEmptyDisplayName = (pubkey: string): Profile | undefined => {
			if (pubkey === reactionPubkey) {
				return { display_name: '', name: 'Named Reaction', customEmojis: [] };
			}
			if (pubkey === repostPubkey) {
				return { display_name: '', name: 'Named Repost', customEmojis: [] };
			}
			return getProfile(pubkey);
		};

		expect(eventToPost(event({}), emptyDisplayNameTarget)).toMatchObject({
			author: 'Named Target'
		});
		expect(reactionEventToPost(reaction, event({}), getProfileWithEmptyDisplayName)).toMatchObject({
			contexts: [
				{
					message: {
						params: { name: 'Named Reaction' }
					}
				}
			]
		});
		expect(repostEventToPost(repost, event({}), getProfileWithEmptyDisplayName)).toMatchObject({
			contexts: [
				{
					message: {
						params: { name: 'Named Repost' }
					}
				}
			]
		});
	});

	test('falls back to the npub prefix when profile names are unavailable', () => {
		const reaction = event({
			id: '2'.repeat(64),
			pubkey: reactionPubkey,
			kind: Reaction,
			content: '+'
		});
		const repost = event({
			id: '3'.repeat(64),
			pubkey: repostPubkey,
			kind: Repost
		});
		const getMissingProfile = () => undefined;

		expect(eventToPost(event({}), undefined)).toMatchObject({
			author: npubEncode(targetPubkey).slice(0, 12),
			handle: npubEncode(targetPubkey).slice(0, 12)
		});
		expect(reactionEventToPost(reaction, event({}), getMissingProfile)).toMatchObject({
			author: npubEncode(targetPubkey).slice(0, 12),
			contexts: [
				{
					message: {
						params: { name: npubEncode(reactionPubkey).slice(0, 12) }
					}
				}
			]
		});
		expect(repostEventToPost(repost, event({}), getMissingProfile)).toMatchObject({
			author: npubEncode(targetPubkey).slice(0, 12),
			contexts: [
				{
					message: {
						params: { name: npubEncode(repostPubkey).slice(0, 12) }
					}
				}
			]
		});
	});

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

	test('keeps profile, post, and reaction emoji definitions separate', () => {
		const reaction = event({
			id: '2'.repeat(64),
			pubkey: reactionPubkey,
			kind: Reaction,
			content: ':same:',
			tags: [['emoji', 'same', 'https://example.com/reaction.png']]
		});
		const target = event({
			content: ':same:',
			tags: [['emoji', 'same', 'https://example.com/post.png']]
		});
		const profile: Profile = {
			display_name: ':same:',
			customEmojis: [{ shortcode: 'same', url: 'https://example.com/profile.png' }]
		};

		const post = reactionEventToPost(reaction, target, (pubkey) =>
			pubkey === reactionPubkey ? profile : getProfile(pubkey)
		);

		expect(post.bodyEmojis).toEqual([{ shortcode: 'same', url: 'https://example.com/post.png' }]);
		expect(post.contexts?.[0].message).toMatchObject({
			nameEmojis: [{ shortcode: 'same', url: 'https://example.com/profile.png' }],
			contentEmojis: [{ shortcode: 'same', url: 'https://example.com/reaction.png' }]
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

	test('keeps reaction source and referenced events for JSON inspection', () => {
		const reaction = event({
			id: '2'.repeat(64),
			pubkey: reactionPubkey,
			kind: Reaction,
			content: '+'
		});
		const target = event({ content: 'Reacted target' });

		expect(reactionEventToPost(reaction, target, getProfile).events).toEqual({
			source: reaction,
			referenced: target
		});
		expect(reactionEventToPost(reaction, undefined, getProfile).events).toEqual({
			source: reaction
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

	test('keeps repost source and referenced events for JSON inspection', () => {
		const repost = event({
			id: '3'.repeat(64),
			pubkey: repostPubkey,
			kind: Repost,
			content: ''
		});
		const target = event({ content: 'Reposted target' });

		expect(repostEventToPost(repost, target, getProfile).events).toEqual({
			source: repost,
			referenced: target
		});
		expect(repostEventToPost(repost, undefined, getProfile).events).toEqual({
			source: repost
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

	test.each([
		[
			'repost',
			(target: Nostr.Event) =>
				repostEventToPost(event({ kind: Repost, content: '' }), target, getProfile)
		],
		[
			'reaction',
			(target: Nostr.Event) =>
				reactionEventToPost(event({ kind: Reaction, content: '+' }), target, getProfile)
		]
	])('keeps content warnings from %s targets', (_name, formatPost) => {
		expect(formatPost(event({ tags: [['content-warning', 'graphic content']] }))).toMatchObject({
			contentWarning: { reason: 'graphic content' }
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

	test('does not treat q tags as replies', () => {
		expect(eventToPost(event({ tags: [['q', '4'.repeat(64)]] }))).not.toHaveProperty('contexts');
	});

	test('formats channel messages as posts', () => {
		expect(eventToPost(event({ kind: ChannelMessage }), getProfile(targetPubkey))).toMatchObject({
			body: 'Target note',
			author: 'Bob'
		});
	});

	test('keeps channel message emoji definitions for the body', () => {
		expect(
			eventToPost(
				event({
					kind: ChannelMessage,
					content: 'Channel :wave:',
					tags: [['emoji', 'wave', 'https://example.com/channel-wave.png']]
				})
			)
		).toMatchObject({
			body: 'Channel :wave:',
			bodyEmojis: [{ shortcode: 'wave', url: 'https://example.com/channel-wave.png' }]
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

	test.each([
		[-1, '0s'],
		[0, '0s'],
		[59, '59s'],
		[60, '1m'],
		[3599, '59m'],
		[3600, '1h'],
		[86399, '23h'],
		[86400, '1d']
	])(
		'preserves relative time at elapsed %s seconds for notes, reposts, and reactions',
		(elapsed, expected) => {
			const now = 2_000_000_000;
			const clock = vi.spyOn(Date, 'now').mockReturnValue(now * 1000);
			try {
				const source = event({ created_at: now - elapsed });
				const target = event({ created_at: now - 10_000 });
				expect(eventToPost(source).time).toBe(expected);
				expect(repostEventToPost({ ...source, kind: Repost }, target, getProfile).time).toBe(
					expected
				);
				expect(reactionEventToPost({ ...source, kind: Reaction }, target, getProfile).time).toBe(
					expected
				);
			} finally {
				clock.mockRestore();
			}
		}
	);
});
