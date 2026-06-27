import { describe, expect, test } from 'vitest';
import { Emojisets } from 'nostr-tools/kinds';
import type * as Nostr from 'nostr-typedef';
import {
	normalizeCustomEmojiReactionCandidates,
	parseEmojiSetCategory,
	parseEmojiSetReference,
	parseEmojiTagCandidates,
	parseUserEmojiSetReferences
} from './emoji-reactions';

const pubkey = 'a'.repeat(64);
const emojiSetAddress = `${Emojisets}:${pubkey}:nostter`;

function emojiSetEvent(tags: string[][]): Nostr.Event {
	return {
		id: 'e'.repeat(64),
		pubkey,
		created_at: 100,
		kind: Emojisets,
		tags,
		content: '',
		sig: '0'.repeat(128)
	};
}

describe('emoji reaction candidates', () => {
	test('groups aliases by URL', () => {
		const candidates = normalizeCustomEmojiReactionCandidates([
			{ shortcode: 'blobcat', url: 'https://emoji.example/blobcat.png' },
			{ shortcode: 'cat', url: 'https://emoji.example/blobcat.png' }
		]);

		expect(candidates).toEqual([
			expect.objectContaining({
				primaryShortcode: 'blobcat',
				shortcodes: ['blobcat', 'cat'],
				url: 'https://emoji.example/blobcat.png'
			})
		]);
	});

	test('keeps colliding shortcodes when URLs differ', () => {
		const candidates = normalizeCustomEmojiReactionCandidates([
			{ shortcode: 'party', url: 'https://emoji.example/party.png' },
			{ shortcode: 'party', url: 'https://cdn.example/party.png' }
		]);

		expect(candidates).toHaveLength(2);
		expect(candidates.map((candidate) => candidate.url)).toEqual([
			'https://emoji.example/party.png',
			'https://cdn.example/party.png'
		]);
		expect(candidates.map((candidate) => candidate.primaryShortcode)).toEqual(['party', 'party']);
		expect(candidates.map((candidate) => candidate.pickerName)).toEqual(['party', 'party_2']);
	});

	test('keeps the same URL in separate event categories', () => {
		const candidates = normalizeCustomEmojiReactionCandidates([
			{
				shortcode: 'party',
				url: 'https://emoji.example/party.png',
				categoryId: '10030:author',
				categoryLabel: 'My emojis',
				categoryOrder: 0
			},
			{
				shortcode: 'party',
				url: 'https://emoji.example/party.png',
				categoryId: emojiSetAddress,
				categoryLabel: 'Nostter',
				categoryOrder: 1,
				address: emojiSetAddress
			}
		]);

		expect(candidates).toHaveLength(2);
		expect(candidates.map((candidate) => candidate.url)).toEqual([
			'https://emoji.example/party.png',
			'https://emoji.example/party.png'
		]);
		expect(candidates.map((candidate) => candidate.categoryLabel)).toEqual([
			'My emojis',
			'Nostter'
		]);
		expect(candidates.map((candidate) => candidate.pickerName)).toEqual(['party', 'party_2']);
	});

	test('parses direct emoji tags from kind 10030', () => {
		expect(
			parseEmojiTagCandidates([
				['emoji', 'blobcat', 'https://emoji.example/blobcat.png'],
				['emoji', 'missing-url']
			])
		).toEqual([{ shortcode: 'blobcat', url: 'https://emoji.example/blobcat.png' }]);
	});

	test('carries category metadata on direct kind 10030 emoji tags', () => {
		expect(
			parseEmojiTagCandidates([['emoji', 'blobcat', 'https://emoji.example/blobcat.png']], {
				categoryId: `10030:${pubkey}`,
				categoryLabel: 'My emojis',
				categoryOrder: 0
			})
		).toEqual([
			{
				shortcode: 'blobcat',
				url: 'https://emoji.example/blobcat.png',
				categoryId: `10030:${pubkey}`,
				categoryLabel: 'My emojis',
				categoryOrder: 0
			}
		]);
	});

	test('parses kind 30030 references from kind 10030 a tags', () => {
		expect(
			parseUserEmojiSetReferences([
				['a', emojiSetAddress, 'wss://relay.example/'],
				['a', '1:bad:address']
			])
		).toEqual([
			{
				address: emojiSetAddress,
				pubkey,
				identifier: 'nostter',
				relay: 'wss://relay.example/'
			}
		]);
	});

	test('carries the kind 30030 address on emoji tag candidates', () => {
		const reference = parseEmojiSetReference(emojiSetAddress);

		expect(reference).toEqual(expect.objectContaining({ address: emojiSetAddress }));
		expect(
			parseEmojiTagCandidates(
				[['emoji', 'sparkle', 'https://emoji.example/sparkle.png']],
				reference?.address
			)
		).toEqual([
			{
				shortcode: 'sparkle',
				url: 'https://emoji.example/sparkle.png',
				address: emojiSetAddress
			}
		]);
	});

	test('uses the kind 30030 title tag as the category label', () => {
		expect(
			parseEmojiSetCategory(
				emojiSetEvent([
					['d', 'nostter'],
					['title', 'Nostter emoji']
				]),
				2
			)
		).toEqual({
			address: emojiSetAddress,
			categoryId: emojiSetAddress,
			categoryLabel: 'Nostter emoji',
			categoryOrder: 2
		});
	});

	test('falls back to the kind 30030 d tag for the category label', () => {
		expect(parseEmojiSetCategory(emojiSetEvent([['d', 'nostter']]), 1)).toEqual({
			address: emojiSetAddress,
			categoryId: emojiSetAddress,
			categoryLabel: 'nostter',
			categoryOrder: 1
		});
	});
});
