import { describe, expect, test } from 'vitest';
import { npubEncode } from 'nostr-tools/nip19';
import { getProfileDisplayName } from './profiles';

const pubkey = 'a'.repeat(64);
const fallbackName = npubEncode(pubkey).slice(0, 12);

describe('profile display names', () => {
	test('falls back to name when display_name is an empty string', () => {
		expect(getProfileDisplayName({ display_name: '', name: 'Alice' }, pubkey)).toBe('Alice');
	});

	test('keeps whitespace-only display_name as a valid name', () => {
		expect(getProfileDisplayName({ display_name: '   ', name: 'Alice' }, pubkey)).toBe('   ');
	});

	test('prefers display_name over name', () => {
		expect(getProfileDisplayName({ display_name: 'Alice Relay', name: 'alice' }, pubkey)).toBe(
			'Alice Relay'
		);
	});

	test('falls back to the npub prefix when display_name and name are empty or missing', () => {
		expect(getProfileDisplayName({ display_name: '', name: '' }, pubkey)).toBe(fallbackName);
		expect(getProfileDisplayName(undefined, pubkey)).toBe(fallbackName);
	});
});
