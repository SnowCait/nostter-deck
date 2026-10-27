import { describe, expect, test } from 'vitest';
import { addMutedPubkey, normalizeMutedPubkeys, removeMutedPubkey } from './muted-users';

const alice = 'A'.repeat(64);
const bob = 'b'.repeat(64);

describe('muted user rules', () => {
	test('drops invalid values', () => {
		expect(normalizeMutedPubkeys([alice, 42, 'invalid'])).toEqual([alice.toLowerCase()]);
	});

	test('adds and removes a muted pubkey', () => {
		expect(addMutedPubkey([alice], bob)).toEqual([alice.toLowerCase(), bob]);
		expect(removeMutedPubkey([alice, bob], alice)).toEqual([bob]);
	});
});
