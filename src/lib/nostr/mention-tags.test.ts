import { nprofileEncode, npubEncode } from 'nostr-tools/nip19';
import { describe, expect, test } from 'vitest';
import { addContentMentionTags, extractMentionPubkeys } from './mention-tags';

const alice = 'a'.repeat(64);
const bob = 'b'.repeat(64);

describe('mention tags', () => {
	test('extracts npub and nprofile references and preserves existing richer p tags', () => {
		const content = [
			`nostr:${npubEncode(alice)}`,
			`nostr:${nprofileEncode({ pubkey: bob, relays: ['wss://relay.example/'] })}`,
			`nostr:${npubEncode(alice)}`
		].join(' ');

		expect(extractMentionPubkeys(content)).toEqual([alice, bob]);
		expect(addContentMentionTags([['p', alice, 'wss://existing.example/']], content)).toEqual([
			['p', alice, 'wss://existing.example/'],
			['p', bob]
		]);
	});

	test('ignores malformed and unsupported nostr references', () => {
		expect(addContentMentionTags([], 'nostr:npub1broken nostr:note1broken')).toEqual([]);
	});
});
