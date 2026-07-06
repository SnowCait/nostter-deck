import { describe, expect, test, vi } from 'vitest';
import { ShortTextNote } from 'nostr-tools/kinds';
import type * as Nostr from 'nostr-typedef';
import { createPostShareController } from './post-share-controller.svelte';
import { eventToPost } from '$lib/nostr/posts';

type TestShareNavigator = Parameters<typeof createPostShareController>[0] extends {
	getNavigator?: () => infer Navigator;
}
	? NonNullable<Navigator>
	: never;

function event(id = '1'.repeat(64)) {
	return {
		id,
		pubkey: 'a'.repeat(64),
		created_at: 100,
		kind: ShortTextNote,
		tags: [],
		content: 'Event content',
		sig: '0'.repeat(128)
	} satisfies Nostr.Event;
}

describe('post share controller', () => {
	test('shares a post URL with the Web Share API when available', async () => {
		const share = vi.fn(async () => undefined);
		const writeText = vi.fn(async () => undefined);
		const controller = createPostShareController({
			getNavigator: () =>
				({
					share,
					clipboard: { writeText }
				}) as TestShareNavigator
		});

		await expect(controller.sharePost(eventToPost(event()))).resolves.toEqual({
			ok: true,
			method: 'web-share'
		});

		expect(share).toHaveBeenCalledWith({
			url: expect.stringMatching(/^https:\/\/nostter\.app\/nevent/)
		});
		expect(writeText).not.toHaveBeenCalled();
	});

	test('copies a post URL when the Web Share API is unavailable', async () => {
		const writeText = vi.fn(async () => undefined);
		const controller = createPostShareController({
			getNavigator: () =>
				({
					share: undefined,
					clipboard: { writeText }
				}) as TestShareNavigator
		});

		await expect(controller.sharePost(eventToPost(event()))).resolves.toEqual({
			ok: true,
			method: 'clipboard'
		});

		expect(writeText).toHaveBeenCalledWith(
			expect.stringMatching(/^https:\/\/nostter\.app\/nevent/)
		);
	});

	test('falls back to the clipboard when Web Share API sharing fails', async () => {
		const share = vi.fn(async () => {
			throw new Error('share failed');
		});
		const writeText = vi.fn(async () => undefined);
		const controller = createPostShareController({
			getNavigator: () =>
				({
					share,
					clipboard: { writeText }
				}) as TestShareNavigator
		});

		await expect(controller.sharePost(eventToPost(event()))).resolves.toEqual({
			ok: true,
			method: 'clipboard'
		});

		expect(writeText).toHaveBeenCalledOnce();
	});

	test('does not report user-cancelled native sharing as a share failure', async () => {
		const share = vi.fn(async () => {
			throw new DOMException('Share dismissed', 'AbortError');
		});
		const writeText = vi.fn(async () => undefined);
		const controller = createPostShareController({
			getNavigator: () =>
				({
					share,
					clipboard: { writeText }
				}) as TestShareNavigator
		});

		await expect(controller.sharePost(eventToPost(event()))).resolves.toEqual({
			ok: false,
			reason: 'cancelled'
		});

		expect(writeText).not.toHaveBeenCalled();
	});

	test('does not share invalid posts', async () => {
		const controller = createPostShareController();

		expect(controller.canSharePost(eventToPost(event('invalid')))).toBe(false);
		await expect(controller.sharePost(eventToPost(event('invalid')))).resolves.toEqual({
			ok: false,
			reason: 'no-target'
		});
	});
});
