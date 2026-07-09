import { describe, expect, test } from 'vitest';
import { isPubkey, normalizePubkey } from './pubkeys';

describe('nostr pubkeys', () => {
	test('accepts lowercase 64-character hex pubkeys', () => {
		const pubkey = 'a'.repeat(64);

		expect(isPubkey(pubkey)).toBe(true);
		expect(normalizePubkey(pubkey)).toBe(pubkey);
	});

	test('normalizes uppercase pubkeys to lowercase', () => {
		expect(normalizePubkey('A'.repeat(64))).toBe('a'.repeat(64));
	});

	test.each(['a'.repeat(63), 'a'.repeat(65), 'g'.repeat(64), '', 1, null, undefined])(
		'rejects invalid pubkey %s',
		(value) => {
			expect(isPubkey(value)).toBe(false);
			expect(normalizePubkey(value)).toBeNull();
		}
	);
});
