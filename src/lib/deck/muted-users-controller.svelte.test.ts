import { beforeEach, describe, expect, test } from 'vitest';
import { readMutedPubkeys, writeMutedPubkeys } from '$lib/muted-users';
import { createMutedUsersController } from './muted-users-controller.svelte';

const alice = 'a'.repeat(64);
const bob = 'b'.repeat(64);

beforeEach(() => {
	writeMutedPubkeys([]);
});

describe('muted users controller', () => {
	test('loads muted users and persists mute changes', () => {
		writeMutedPubkeys([alice]);
		const controller = createMutedUsersController();

		expect(controller.pubkeys).toEqual([alice]);
		expect(controller.isMutedUser(alice)).toBe(true);

		controller.muteUser(bob);
		expect(controller.pubkeys).toEqual([alice, bob]);
		expect(readMutedPubkeys()).toEqual([alice, bob]);

		controller.unmuteUser(alice);
		expect(controller.pubkeys).toEqual([bob]);
		expect(controller.isMutedUser(alice)).toBe(false);
	});
});
