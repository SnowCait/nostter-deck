import { describe, expect, test } from 'vitest';
import { applyComposerEmojiSelection, type ComposerCustomEmoji } from './composer-emoji-actions';

describe('composer emoji selection', () => {
	test('inserts Unicode emoji without changing custom emoji state', () => {
		const customEmojis: ComposerCustomEmoji[] = [];

		expect(applyComposerEmojiSelection(customEmojis, { type: 'unicode', emoji: '😀' })).toEqual({
			insertion: '😀',
			customEmojis
		});
	});

	test('assigns unique shortcodes to different custom emoji with the same source shortcode', () => {
		const first = applyComposerEmojiSelection([], {
			type: 'custom',
			shortcode: 'party',
			url: 'https://emoji.example/first.png'
		});
		const second = applyComposerEmojiSelection(first.customEmojis, {
			type: 'custom',
			shortcode: 'party',
			url: 'https://emoji.example/second.png',
			address: `30030:${'a'.repeat(64)}:second`
		});
		const third = applyComposerEmojiSelection(second.customEmojis, {
			type: 'custom',
			shortcode: 'party',
			url: 'https://emoji.example/third.png'
		});

		expect(first.insertion).toBe(':party:');
		expect(second.insertion).toBe(':party_2:');
		expect(third.insertion).toBe(':party_3:');
		expect(third.customEmojis).toEqual([
			{
				shortcode: 'party',
				sourceShortcode: 'party',
				url: 'https://emoji.example/first.png'
			},
			{
				shortcode: 'party_2',
				sourceShortcode: 'party',
				url: 'https://emoji.example/second.png',
				address: `30030:${'a'.repeat(64)}:second`
			},
			{
				shortcode: 'party_3',
				sourceShortcode: 'party',
				url: 'https://emoji.example/third.png'
			}
		]);
	});

	test('reuses the assigned shortcode when the same custom emoji is selected again', () => {
		const reaction = {
			type: 'custom' as const,
			shortcode: 'party',
			url: 'https://emoji.example/party.png',
			address: `30030:${'a'.repeat(64)}:party`
		};
		const first = applyComposerEmojiSelection([], reaction);
		const repeated = applyComposerEmojiSelection(first.customEmojis, reaction);

		expect(repeated.insertion).toBe(':party:');
		expect(repeated.customEmojis).toBe(first.customEmojis);
	});
});
