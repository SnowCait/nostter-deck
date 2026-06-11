import { beforeEach, describe, expect, test, vi } from 'vitest';
import {
	addMutedPubkey,
	mutedUsersStorageKey,
	readMutedPubkeys,
	removeMutedPubkey,
	writeMutedPubkeys
} from './muted-users';

const storage = new Map<string, string>();
const alice = 'A'.repeat(64);
const bob = 'b'.repeat(64);

beforeEach(() => {
	storage.clear();
	vi.stubGlobal('localStorage', {
		getItem: (key: string) => storage.get(key) ?? null,
		setItem: (key: string, value: string) => storage.set(key, value)
	});
});

describe('muted users', () => {
	test('normalizes, deduplicates, and persists pubkeys', () => {
		writeMutedPubkeys([alice, alice.toLowerCase(), 'invalid', bob]);

		expect(readMutedPubkeys()).toEqual([alice.toLowerCase(), bob]);
		expect(JSON.parse(storage.get(mutedUsersStorageKey) ?? 'null')).toEqual([
			alice.toLowerCase(),
			bob
		]);
	});

	test('drops invalid persisted values', () => {
		storage.set(mutedUsersStorageKey, JSON.stringify([alice, 42, 'invalid']));

		expect(readMutedPubkeys()).toEqual([alice.toLowerCase()]);
	});

	test('adds and removes a muted pubkey', () => {
		expect(addMutedPubkey([alice], bob)).toEqual([alice.toLowerCase(), bob]);
		expect(removeMutedPubkey([alice, bob], alice)).toEqual([bob]);
	});
});
