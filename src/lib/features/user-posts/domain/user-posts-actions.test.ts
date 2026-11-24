import { npubEncode } from 'nostr-tools/nip19';
import type * as Nostr from 'nostr-typedef';
import { expect, test } from 'vitest';
import {
	isVisibleUserPost,
	resolveUserPostsSettings,
	type UserPostsDraft
} from './user-posts-actions';

const pubkey = 'a'.repeat(64);
const other = 'b'.repeat(64);
const reference = 'c'.repeat(64);

function event(fields: Partial<Nostr.Event> = {}): Nostr.Event {
	return {
		id: 'd'.repeat(64),
		pubkey,
		kind: 1,
		content: '',
		tags: [],
		created_at: 0,
		sig: '',
		...fields
	};
}

test('filters replies and kind 6 reposts independently and keeps quote-only posts', () => {
	const settings = {
		pubkey,
		relays: { type: 'default' } as const,
		includeReplies: true,
		includeReposts: true
	};
	const reply = event({ tags: [['e', reference, '', 'root']] });
	const quote = event({ tags: [['q', reference]] });
	const repost = event({ kind: 6, tags: [['e', reference]] });

	expect(isVisibleUserPost(reply, settings)).toBe(true);
	expect(isVisibleUserPost(repost, settings)).toBe(true);
	expect(isVisibleUserPost(reply, { ...settings, includeReplies: false })).toBe(false);
	expect(isVisibleUserPost(repost, { ...settings, includeReplies: false })).toBe(true);
	expect(isVisibleUserPost(reply, { ...settings, includeReposts: false })).toBe(true);
	expect(isVisibleUserPost(repost, { ...settings, includeReposts: false })).toBe(false);
	expect(isVisibleUserPost(quote, { ...settings, includeReplies: false })).toBe(true);
	for (const invalid of [event({ kind: 16 }), event({ kind: 7 }), event({ pubkey: other })]) {
		expect(isVisibleUserPost(invalid, settings)).toBe(false);
	}
});

test('retargets only the target-user relay selection and requires a valid public key and relay choice', () => {
	const draft: UserPostsDraft = {
		target: npubEncode(other),
		relays: { type: 'nip65', pubkey },
		includeReplies: false,
		includeReposts: true
	};
	expect(resolveUserPostsSettings(draft)).toEqual({
		pubkey: other,
		relays: { type: 'nip65', pubkey: other },
		includeReplies: false,
		includeReposts: true
	});
	for (const relays of [
		{ type: 'default' },
		{ type: 'custom', urls: ['wss://relay.example/'] }
	] as const) {
		expect(
			resolveUserPostsSettings({
				...draft,
				relays: relays.type === 'custom' ? { ...relays, urls: [...relays.urls] } : relays
			})?.relays
		).toEqual(relays);
	}
	expect(resolveUserPostsSettings({ ...draft, target: 'npub1invalid' })).toBeNull();
	expect(resolveUserPostsSettings({ ...draft, relays: null })).toBeNull();
});
