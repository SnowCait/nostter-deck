import { describe, expect, test } from 'vitest';
import {
	normalizeAccountSettingsStore,
	readAccountSettings,
	readLikeReaction,
	resetLikeReaction,
	writeLikeReaction
} from './account-settings';

const pubkey = 'a'.repeat(64);
const otherPubkey = 'b'.repeat(64);
const resetPubkey = 'c'.repeat(64);
const unknownPubkey = 'd'.repeat(64);

describe('account settings storage', () => {
	test('uses plus as the default like for unknown accounts and signed-out state', () => {
		expect(readLikeReaction(null)).toEqual({ type: 'plus' });
		expect(readAccountSettings(unknownPubkey)).toEqual({
			likeReaction: { type: 'plus' }
		});
	});

	test('stores like settings per account', () => {
		writeLikeReaction(pubkey, { type: 'unicode', emoji: '⭐' });
		writeLikeReaction(otherPubkey, {
			type: 'custom',
			shortcode: 'blobcat',
			url: 'https://example.com/blobcat.png',
			address: `30030:${otherPubkey}:cats`
		});

		expect(readLikeReaction(pubkey)).toEqual({ type: 'unicode', emoji: '⭐' });
		expect(readLikeReaction(otherPubkey)).toEqual({
			type: 'custom',
			shortcode: 'blobcat',
			url: 'https://example.com/blobcat.png',
			address: `30030:${otherPubkey}:cats`
		});
	});

	test('normalizes invalid persisted settings', () => {
		const normalized = normalizeAccountSettingsStore({
			[pubkey.toUpperCase()]: { likeReaction: { type: 'unicode', emoji: '🐾' } },
			[otherPubkey]: {
				likeReaction: { type: 'custom', shortcode: 'bad space', url: 'http://x' }
			},
			notapubkey: { likeReaction: { type: 'unicode', emoji: '⭐' } }
		});

		expect(normalized).toEqual({
			[pubkey]: { likeReaction: { type: 'unicode', emoji: '🐾' } },
			[otherPubkey]: { likeReaction: { type: 'plus' } }
		});
	});

	test('resets like settings to plus', () => {
		writeLikeReaction(resetPubkey, { type: 'unicode', emoji: '⭐' });
		resetLikeReaction(resetPubkey);

		expect(readLikeReaction(resetPubkey)).toEqual({ type: 'plus' });
	});
});
