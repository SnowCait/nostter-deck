import { describe, expect, test } from 'vitest';
import { linkifyPostContent } from './post-content-links';

const nostrNpub = 'nostr:npub1424242424242424242424242424242424242424242424242424qamrcaj';
const nostrNprofile =
	'nostr:nprofile1qy28wumn8ghj7un9d3shjtn90psk6urvv5hsqg924242424242424242424242424242424242424242424242424gv3cla6';
const nostrNote = 'nostr:note1zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zygsglnzgl';
const nostrNevent =
	'nostr:nevent1qvzqqqqqqypzp242424242424242424242424242424242424242424242424242qy28wumn8ghj7un9d3shjtn90psk6urvv5hsqgq3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyuv4j77';
const nostrNaddr =
	'nostr:naddr1qvzqqqr4gupzp242424242424242424242424242424242424242424242424242qy28wumn8ghj7un9d3shjtn90psk6urvv5hsqpmpwf6xjcmvv5hynj0x';
const nostrNsec = 'nostr:nsec1yg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3qxh9tww';

describe('post content links', () => {
	test('parses supported NIP-21 references', () => {
		const tokens = linkifyPostContent(
			[nostrNpub, nostrNprofile, nostrNote, nostrNevent, nostrNaddr].join(' ')
		).filter((token) => token.type === 'nostrReference');

		expect(tokens.map((token) => token.entityType)).toEqual([
			'npub',
			'nprofile',
			'note',
			'nevent',
			'naddr'
		]);
		expect(tokens.map((token) => token.href)).toEqual([
			nostrNpub,
			nostrNprofile,
			nostrNote,
			nostrNevent,
			nostrNaddr
		]);
	});

	test('does not parse nsec or bare nostr identifiers as links', () => {
		const tokens = linkifyPostContent(
			`${nostrNsec} www.example.com npub1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq0l98cr`
		);

		expect(tokens).toEqual([
			{
				type: 'text',
				text: `${nostrNsec} www.example.com npub1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq0l98cr`
			}
		]);
	});

	test('keeps duplicate URLs as separate link tokens', () => {
		const url = 'https://example.com/image';
		const tokens = linkifyPostContent(`${url} ${url}`).filter((token) => token.type === 'link');

		expect(tokens).toEqual([
			{ type: 'link', text: url, href: url },
			{ type: 'link', text: url, href: url }
		]);
	});
});
