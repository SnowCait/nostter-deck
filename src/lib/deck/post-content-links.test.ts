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
		expect(tokens[2]).toMatchObject({
			entityType: 'note',
			eventId: '1'.repeat(64)
		});
		expect(tokens[2]).not.toHaveProperty('relayHints');
		expect(tokens[3]).toMatchObject({
			entityType: 'nevent',
			eventId: '1'.repeat(64),
			relayHints: ['wss://relay.example/']
		});
		expect(tokens[4]).not.toHaveProperty('eventId');
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

	test('parses hashtags from post text', () => {
		expect(
			linkifyPostContent(
				'Hello #nostr, #日本語 and #under_score.',
				[],
				['nostr', '日本語', 'under_score']
			)
		).toEqual([
			{ type: 'text', text: 'Hello ' },
			{ type: 'hashtag', text: '#nostr', tag: 'nostr' },
			{ type: 'text', text: ', ' },
			{ type: 'hashtag', text: '#日本語', tag: '日本語' },
			{ type: 'text', text: ' and ' },
			{ type: 'hashtag', text: '#under_score', tag: 'under_score' },
			{ type: 'text', text: '.' }
		]);
	});

	test('only parses hashtags declared by t tags, ignoring case', () => {
		expect(linkifyPostContent('#Nostr #plain #日本語', [], ['nostr', '日本語'])).toEqual([
			{ type: 'hashtag', text: '#Nostr', tag: 'Nostr' },
			{ type: 'text', text: ' #plain ' },
			{ type: 'hashtag', text: '#日本語', tag: '日本語' }
		]);
		expect(linkifyPostContent('#nostr')).toEqual([{ type: 'text', text: '#nostr' }]);
	});

	test('does not parse hashes inside words, URLs, NIP-21 references, or custom emojis', () => {
		const emoji = { shortcode: 'hash', url: 'https://example.com/#emoji' };
		const tokens = linkifyPostContent(
			`word#tag https://example.com/#section ${nostrNevent} :hash: #visible`,
			[emoji],
			['tag', 'section', 'visible']
		);

		expect(tokens.filter((token) => token.type === 'hashtag')).toEqual([
			{ type: 'hashtag', text: '#visible', tag: 'visible' }
		]);
		expect(tokens).toContainEqual({
			type: 'customEmoji',
			text: ':hash:',
			shortcode: 'hash',
			url: 'https://example.com/#emoji'
		});
	});

	test('parses custom emoji outside links without changing shortcodes inside URLs', () => {
		const emoji = { shortcode: 'party', url: 'https://example.com/party.png' };
		const tokens = linkifyPostContent('Hello :party: https://example.com/:party:/image :unknown:', [
			emoji
		]);

		expect(tokens).toEqual([
			{ type: 'text', text: 'Hello ' },
			{
				type: 'customEmoji',
				text: ':party:',
				shortcode: 'party',
				url: 'https://example.com/party.png'
			},
			{ type: 'text', text: ' ' },
			{
				type: 'link',
				text: 'https://example.com/:party:/image',
				href: 'https://example.com/:party:/image'
			},
			{ type: 'text', text: ' :unknown:' }
		]);
	});
});
