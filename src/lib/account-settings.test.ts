import { beforeEach, describe, expect, test } from 'vitest';
import {
	normalizeAccountSettingsStore,
	readAccountSettings,
	readLikeReaction,
	resetLikeReaction,
	writeAccountSettingsStore,
	writeLikeReaction
} from './account-settings';

const pubkey = 'a'.repeat(64);
const otherPubkey = 'b'.repeat(64);

describe('account settings storage', () => {
	beforeEach(() => {
		writeAccountSettingsStore({});
	});

	test('uses plus as the default like for unknown accounts and signed-out state', () => {
		expect(readLikeReaction(null)).toEqual({ type: 'plus' });
		expect(readAccountSettings(pubkey)).toEqual({
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
		writeAccountSettingsStore(normalized);

		expect(readLikeReaction(pubkey)).toEqual({ type: 'unicode', emoji: '🐾' });
		expect(readLikeReaction(otherPubkey)).toEqual({ type: 'plus' });
		expect(normalized).toHaveProperty(pubkey);
	});

	test('resets like settings to plus', () => {
		writeLikeReaction(pubkey, { type: 'unicode', emoji: '⭐' });
		resetLikeReaction(pubkey);

		expect(readLikeReaction(pubkey)).toEqual({ type: 'plus' });
	});
});
