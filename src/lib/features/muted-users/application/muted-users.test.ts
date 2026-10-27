import { beforeEach, describe, expect, test } from 'vitest';
import { readMutedPubkeys, writeMutedPubkeys } from './muted-users';

const alice = 'A'.repeat(64);
const bob = 'b'.repeat(64);

beforeEach(() => {
	writeMutedPubkeys([]);
});

describe('muted users storage', () => {
	test('normalizes, deduplicates, and persists pubkeys', () => {
		writeMutedPubkeys([alice, alice.toLowerCase(), 'invalid', bob]);

		expect(readMutedPubkeys()).toEqual([alice.toLowerCase(), bob]);
	});
});
