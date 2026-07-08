import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import {
	accountSettingsStorageKey,
	readAccountSettings,
	readLikeReaction,
	resetLikeReaction,
	writeLikeReaction
} from './account-settings';

const pubkey = 'a'.repeat(64);
const otherPubkey = 'b'.repeat(64);

function installLocalStorage() {
	const values = new Map<string, string>();

	vi.stubGlobal('localStorage', {
		getItem: vi.fn((key: string) => values.get(key) ?? null),
		setItem: vi.fn((key: string, value: string) => {
			values.set(key, value);
		})
	});

	return values;
}

describe('account settings storage', () => {
	let storageValues: Map<string, string>;

	beforeEach(() => {
		storageValues = installLocalStorage();
	});

	afterEach(() => {
		vi.unstubAllGlobals();
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
		storageValues.set(
			accountSettingsStorageKey,
			JSON.stringify({
				[pubkey.toUpperCase()]: { likeReaction: { type: 'unicode', emoji: '🐾' } },
				[otherPubkey]: {
					likeReaction: { type: 'custom', shortcode: 'bad space', url: 'http://x' }
				},
				notapubkey: { likeReaction: { type: 'unicode', emoji: '⭐' } }
			})
		);

		expect(readLikeReaction(pubkey)).toEqual({ type: 'unicode', emoji: '🐾' });
		expect(readLikeReaction(otherPubkey)).toEqual({ type: 'plus' });
		expect(JSON.parse(storageValues.get(accountSettingsStorageKey) ?? '{}')).toHaveProperty(
			pubkey.toUpperCase()
		);
	});

	test('resets like settings to plus', () => {
		writeLikeReaction(pubkey, { type: 'unicode', emoji: '⭐' });
		resetLikeReaction(pubkey);

		expect(readLikeReaction(pubkey)).toEqual({ type: 'plus' });
	});
});
