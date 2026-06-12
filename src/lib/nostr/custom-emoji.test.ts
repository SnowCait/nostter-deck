import { describe, expect, test } from 'vitest';
import { parseCustomEmojis, tokenizeCustomEmojiText } from './custom-emoji';

describe('custom emoji', () => {
	test('parses valid HTTPS emoji tags and keeps the first duplicate', () => {
		expect(
			parseCustomEmojis([
				['emoji', 'party_blob-1', 'https://example.com/party.png', `30030:${'a'.repeat(64)}:set`],
				['emoji', 'party_blob-1', 'https://example.com/duplicate.png'],
				['emoji', 'second', 'https://example.com/second.svg']
			])
		).toEqual([
			{ shortcode: 'party_blob-1', url: 'https://example.com/party.png' },
			{ shortcode: 'second', url: 'https://example.com/second.svg' }
		]);
	});

	test('rejects HTTP URLs and invalid shortcodes', () => {
		expect(
			parseCustomEmojis([
				['emoji', 'mixed', 'http://example.com/mixed.png'],
				['emoji', 'has space', 'https://example.com/space.png'],
				['emoji', 'missing-url']
			])
		).toEqual([]);
	});

	test('replaces only defined shortcodes', () => {
		expect(
			tokenizeCustomEmojiText('Hello :party: :unknown:', [
				{ shortcode: 'party', url: 'https://example.com/party.png' }
			])
		).toEqual([
			{ type: 'text', text: 'Hello ' },
			{
				type: 'customEmoji',
				text: ':party:',
				shortcode: 'party',
				url: 'https://example.com/party.png'
			},
			{ type: 'text', text: ' :unknown:' }
		]);
	});
});
