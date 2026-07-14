import { beforeEach, describe, expect, test } from 'vitest';
import {
	addMutedPubkey,
	normalizeMutedPubkeys,
	readMutedPubkeys,
	removeMutedPubkey,
	writeMutedPubkeys
} from './muted-users';

const alice = 'A'.repeat(64);
const bob = 'b'.repeat(64);

beforeEach(() => {
	writeMutedPubkeys([]);
});

describe('muted users', () => {
	test('normalizes, deduplicates, and persists pubkeys', () => {
		writeMutedPubkeys([alice, alice.toLowerCase(), 'invalid', bob]);

		expect(readMutedPubkeys()).toEqual([alice.toLowerCase(), bob]);
	});

	test('drops invalid values', () => {
		expect(normalizeMutedPubkeys([alice, 42, 'invalid'])).toEqual([alice.toLowerCase()]);
	});

	test('adds and removes a muted pubkey', () => {
		expect(addMutedPubkey([alice], bob)).toEqual([alice.toLowerCase(), bob]);
		expect(removeMutedPubkey([alice, bob], alice)).toEqual([bob]);
	});
});
