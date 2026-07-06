import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { mutedUsersStorageKey } from '$lib/muted-users';
import { createMutedUsersController } from './muted-users-controller.svelte';

const storage = new Map<string, string>();
const alice = 'a'.repeat(64);
const bob = 'b'.repeat(64);

beforeEach(() => {
	storage.clear();
	vi.stubGlobal('localStorage', {
		getItem: vi.fn((key: string) => storage.get(key) ?? null),
		setItem: vi.fn((key: string, value: string) => storage.set(key, value))
	});
});

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('muted users controller', () => {
	test('loads muted users and persists mute changes', () => {
		storage.set(mutedUsersStorageKey, JSON.stringify([alice]));
		const controller = createMutedUsersController();

		expect(controller.pubkeys).toEqual([alice]);
		expect(controller.isMutedUser(alice)).toBe(true);

		controller.muteUser(bob);
		expect(controller.pubkeys).toEqual([alice, bob]);
		expect(JSON.parse(storage.get(mutedUsersStorageKey) ?? 'null')).toEqual([alice, bob]);

		controller.unmuteUser(alice);
		expect(controller.pubkeys).toEqual([bob]);
		expect(controller.isMutedUser(alice)).toBe(false);
	});
});
