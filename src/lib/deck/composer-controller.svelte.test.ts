import { describe, expect, test, vi, beforeEach } from 'vitest';
import { Reaction, ShortTextNote } from 'nostr-tools/kinds';
import type { EventSigner } from 'rx-nostr';
import type * as Nostr from 'nostr-typedef';
import { createComposerController } from './composer-controller.svelte';
import { eventToPost } from '$lib/nostr/posts';

const publishChannelMessage = vi.hoisted(() => vi.fn());
const publishReply = vi.hoisted(() => vi.fn());
const publishShortTextNote = vi.hoisted(() => vi.fn());

vi.mock('$lib/nostr/publish', () => ({
	publishChannelMessage,
	publishReply,
	publishShortTextNote
}));

const pubkey = 'a'.repeat(64);
const targetPubkey = 'b'.repeat(64);
const targetRelay = 'wss://target.example/';

function event(id: string, patch: Partial<Nostr.Event> = {}) {
	return {
		id,
		pubkey: targetPubkey,
		created_at: 100,
		kind: ShortTextNote,
		tags: [],
		content: id,
		sig: '0'.repeat(128),
		...patch
	} satisfies Nostr.Event;
}

function createSigner(): EventSigner {
	return {
		getPublicKey: vi.fn(async () => pubkey),
		signEvent: vi.fn()
	};
}

function createHarness({
	getAccountPubkey = () => pubkey,
	getSigner = () => createSigner()
}: {
	getAccountPubkey?: () => string | null;
	getSigner?: () => EventSigner | null;
} = {}) {
	const focusTextarea = vi.fn();
	const getTargetReadRelays = vi.fn(async () => [targetRelay]);
	const controller = createComposerController({
		getAccountPubkey,
		getSigner,
		getIncludeClientTag: () => true,
		focusTextarea,
		getTargetReadRelays
	});

	return { controller, focusTextarea, getTargetReadRelays };
}

describe('composer controller', () => {
	beforeEach(() => {
		publishChannelMessage.mockReset();
		publishReply.mockReset();
		publishShortTextNote.mockReset();
	});

	test('opens reply mode and preserves a draft only for the same reply target', async () => {
		const firstTarget = event('1'.repeat(64));
		const secondTarget = event('2'.repeat(64));
		const harness = createHarness();

		await harness.controller.openReply(eventToPost(firstTarget));
		expect(harness.controller.isOpen).toBe(true);
		expect(harness.controller.isReplyMode).toBe(true);
		expect(harness.controller.replyTargetPost?.id).toBe(firstTarget.id);
		expect(harness.focusTextarea).toHaveBeenCalledOnce();

		harness.controller.content = 'Draft reply';
		harness.controller.close();
		await harness.controller.openReply(eventToPost(firstTarget));
		expect(harness.controller.content).toBe('Draft reply');

		await harness.controller.openReply(eventToPost(secondTarget));
		expect(harness.controller.content).toBe('');

		harness.controller.content = 'Another draft';
		await harness.controller.open();
		expect(harness.controller.isReplyMode).toBe(false);
		expect(harness.controller.replyTargetPost).toBeNull();
		expect(harness.controller.content).toBe('');
	});

	test('publishes a reply with target read relays and clears reply mode on success', async () => {
		const target = event('3'.repeat(64));
		const post = eventToPost(target);
		const harness = createHarness();
		publishReply.mockResolvedValueOnce({
			ok: true,
			event: event('f'.repeat(64), { pubkey, content: 'Published reply' })
		});

		await harness.controller.openReply(post);
		harness.controller.content = 'Published reply';
		await harness.controller.publish();

		expect(harness.getTargetReadRelays).toHaveBeenCalledWith(targetPubkey);
		expect(publishReply).toHaveBeenCalledWith(
			'Published reply',
			target,
			pubkey,
			expect.anything(),
			[targetRelay],
			{ includeClientTag: true }
		);
		expect(harness.controller.isOpen).toBe(false);
		expect(harness.controller.isReplyMode).toBe(false);
		expect(harness.controller.content).toBe('');
	});

	test('keeps the reply draft visible when publishing fails', async () => {
		const target = event('4'.repeat(64));
		const harness = createHarness();
		publishReply.mockResolvedValueOnce({ ok: false, reason: 'relay-failed' });

		await harness.controller.openReply(eventToPost(target));
		harness.controller.content = 'Keep this reply';
		await harness.controller.publish();

		expect(harness.controller.isOpen).toBe(true);
		expect(harness.controller.isReplyMode).toBe(true);
		expect(harness.controller.content).toBe('Keep this reply');
		expect(harness.controller.hasError).toBe(true);
	});

	test('does not open reply mode for unsupported or unauthenticated targets', async () => {
		const unauthenticated = createHarness({ getAccountPubkey: () => null });
		await unauthenticated.controller.openReply(eventToPost(event('5'.repeat(64))));
		expect(unauthenticated.controller.isOpen).toBe(false);

		const unsupported = createHarness();
		await unsupported.controller.openReply(eventToPost(event('6'.repeat(64), { kind: Reaction })));
		expect(unsupported.controller.isOpen).toBe(false);
	});
});
