import { beforeEach, describe, expect, test, vi } from 'vitest';
import { Reaction, ShortTextNote } from 'nostr-tools/kinds';
import type * as Nostr from 'nostr-typedef';
import { createPostActionController } from './post-action-controller.svelte';
import type { Post } from './types';
import { eventToPost } from '$lib/nostr/posts';
import type { Nip07Signer } from '$lib/nostr/auth.svelte';

const publishLikeReaction = vi.hoisted(() => vi.fn());
const publishEmojiReaction = vi.hoisted(() => vi.fn());

vi.mock('$lib/nostr/publish', () => ({
	publishEmojiReaction,
	publishLikeReaction
}));

const pubkey = 'a'.repeat(64);
const targetPubkey = 'b'.repeat(64);
const targetRelay = 'wss://target.example/';

function event(
	id: string,
	{
		kind = ShortTextNote,
		pubkey = targetPubkey
	}: {
		kind?: number;
		pubkey?: string;
	} = {}
) {
	return {
		id,
		pubkey,
		created_at: 100,
		kind,
		tags: [],
		content: id,
		sig: '0'.repeat(128)
	} satisfies Nostr.Event;
}

function createSigner(): Nip07Signer {
	return {
		getPublicKey: vi.fn(async () => pubkey),
		signEvent: vi.fn()
	};
}

function createHarness({
	getAccountPubkey = () => pubkey,
	getSigner = () => createSigner(),
	getTargetReadRelays = vi.fn(async () => [targetRelay])
}: {
	getAccountPubkey?: () => string | null;
	getSigner?: () => Nip07Signer | null;
	getTargetReadRelays?: (pubkey: string) => Promise<string[]>;
} = {}) {
	return {
		getTargetReadRelays,
		controller: createPostActionController({
			getAccountPubkey,
			getSigner,
			getIncludeClientTag: () => true,
			getTargetReadRelays
		})
	};
}

function publishedReaction(target: Nostr.Event) {
	return {
		ok: true,
		event: {
			...target,
			id: 'f'.repeat(64),
			kind: Reaction,
			pubkey,
			content: '+'
		}
	} as const;
}

describe('post action controller', () => {
	beforeEach(() => {
		publishLikeReaction.mockReset();
		publishEmojiReaction.mockReset();
	});

	test('publishes a like and remembers the target event as liked', async () => {
		const target = event('1'.repeat(64));
		const post = eventToPost(target);
		const harness = createHarness();
		publishLikeReaction.mockResolvedValueOnce(publishedReaction(target));

		await expect(harness.controller.likePost(post)).resolves.toMatchObject({ ok: true });

		expect(harness.getTargetReadRelays).toHaveBeenCalledWith(targetPubkey);
		expect(publishLikeReaction).toHaveBeenCalledWith(
			target,
			pubkey,
			expect.anything(),
			[targetRelay],
			{
				includeClientTag: true
			}
		);
		expect(harness.controller.isLiked(post)).toBe(true);
		expect(harness.controller.canLike(post)).toBe(false);
	});

	test('prevents duplicate like publishing while a like is in flight', async () => {
		const target = event('2'.repeat(64));
		const post = eventToPost(target);
		const harness = createHarness();
		let resolvePublish!: (value: ReturnType<typeof publishedReaction>) => void;
		publishLikeReaction.mockReturnValueOnce(
			new Promise((resolve) => {
				resolvePublish = resolve;
			})
		);

		const firstResult = harness.controller.likePost(post);
		expect(harness.controller.isLiking(post)).toBe(true);
		await expect(harness.controller.likePost(post)).resolves.toEqual({
			ok: false,
			reason: 'already-publishing'
		});

		resolvePublish(publishedReaction(target));
		await expect(firstResult).resolves.toMatchObject({ ok: true });

		expect(publishLikeReaction).toHaveBeenCalledOnce();
		expect(harness.controller.isLiking(post)).toBe(false);
	});

	test('does not mark a post as liked when publishing fails', async () => {
		const target = event('3'.repeat(64));
		const post = eventToPost(target);
		const harness = createHarness();
		publishLikeReaction.mockResolvedValueOnce({ ok: false, reason: 'relay-failed' });

		await expect(harness.controller.likePost(post)).resolves.toEqual({
			ok: false,
			reason: 'relay-failed'
		});

		expect(harness.controller.isLiked(post)).toBe(false);
		expect(harness.controller.canLike(post)).toBe(true);
	});

	test('does not publish when a reference card has no loaded target event', async () => {
		const source = event('4'.repeat(64), { kind: Reaction, pubkey });
		const post = {
			...eventToPost(source),
			events: { source },
			referenceType: 'reaction',
			referenceStatus: 'unavailable'
		} satisfies Post;
		const harness = createHarness();

		await expect(harness.controller.likePost(post)).resolves.toEqual({
			ok: false,
			reason: 'no-target'
		});

		expect(harness.controller.canLike(post)).toBe(false);
		expect(publishLikeReaction).not.toHaveBeenCalled();
	});

	test('prevents duplicate emoji reaction publishing while the same reaction is in flight', async () => {
		const target = event('5'.repeat(64));
		const post = eventToPost(target);
		const harness = createHarness();
		const reaction = { type: 'unicode', emoji: '🔥' } as const;
		let resolvePublish!: (value: ReturnType<typeof publishedReaction>) => void;
		publishEmojiReaction.mockReturnValueOnce(
			new Promise((resolve) => {
				resolvePublish = resolve;
			})
		);

		const firstResult = harness.controller.reactWithEmoji(post, reaction);
		expect(harness.controller.isReactingWithEmoji(post)).toBe(true);
		await expect(harness.controller.reactWithEmoji(post, reaction)).resolves.toEqual({
			ok: false,
			reason: 'already-publishing'
		});

		resolvePublish(publishedReaction(target));
		await expect(firstResult).resolves.toMatchObject({ ok: true });

		expect(publishEmojiReaction).toHaveBeenCalledOnce();
		expect(publishEmojiReaction).toHaveBeenCalledWith(
			target,
			reaction,
			pubkey,
			expect.anything(),
			[targetRelay],
			{ includeClientTag: true }
		);
		expect(harness.controller.isReactingWithEmoji(post)).toBe(false);
	});
});
