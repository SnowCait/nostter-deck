import { describe, expect, test, vi, beforeEach } from 'vitest';
import { Reaction, ShortTextNote } from 'nostr-tools/kinds';
import type { EventSigner } from 'rx-nostr';
import type * as Nostr from 'nostr-typedef';
import { createComposerController } from './composer-controller.svelte';
import { createMediaAttachmentController } from './media-attachment-controller.svelte';
import type { ChannelTimelineColumnConfig } from './types';
import { eventToPost } from '$lib/nostr/posts';

const publishChannelMessage = vi.hoisted(() => vi.fn());
const publishQuoteRepost = vi.hoisted(() => vi.fn());
const publishReply = vi.hoisted(() => vi.fn());
const publishShortTextNote = vi.hoisted(() => vi.fn());

vi.mock('$lib/nostr/publish', () => ({
	publishChannelMessage,
	publishQuoteRepost,
	publishReply,
	publishShortTextNote
}));

const pubkey = 'a'.repeat(64);
const targetPubkey = 'b'.repeat(64);
const targetRelay = 'wss://target.example/';
const channel = {
	id: 'channel-column',
	type: 'timeline',
	timelineKind: 'preset',
	sourceKey: 'timeline_channel',
	channelId: '4'.repeat(64),
	relays: { type: 'custom', urls: ['wss://channel.example/'] },
	width: 'standard'
} satisfies ChannelTimelineColumnConfig;
type UploadMedia = NonNullable<Parameters<typeof createComposerController>[0]['uploadMedia']>;

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

function file(name: string, options: { type?: string; size?: number } = {}) {
	const candidate = new File(['image'], name, { type: options.type ?? 'image/png' });
	if (options.size !== undefined) {
		Object.defineProperty(candidate, 'size', { value: options.size });
	}
	return candidate;
}

function uploaded(url: string) {
	return {
		ok: true as const,
		descriptor: {
			url,
			sha256: 'c'.repeat(64),
			size: 100,
			type: 'image/webp',
			uploaded: 100
		}
	};
}

function createHarness({
	getAccountPubkey = () => pubkey,
	getSigner = () => createSigner(),
	uploadMedia = vi.fn(async (media: File) =>
		uploaded(`https://blossom.band/${media.name}.webp`)
	) as unknown as UploadMedia
}: {
	getAccountPubkey?: () => string | null;
	getSigner?: () => EventSigner | null;
	uploadMedia?: UploadMedia;
} = {}) {
	const focusTextarea = vi.fn();
	const getTargetReadRelays = vi.fn(async () => [targetRelay]);
	const controller = createComposerController({
		getAccountPubkey,
		getSigner,
		getIncludeClientTag: () => true,
		focusTextarea,
		getTargetReadRelays,
		uploadMedia
	});

	return { controller, focusTextarea, getTargetReadRelays, uploadMedia };
}

describe('composer controller', () => {
	beforeEach(() => {
		publishChannelMessage.mockReset();
		publishQuoteRepost.mockReset();
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

	test('opens quote mode and preserves a draft only for the same quote target', async () => {
		const firstTarget = event('7'.repeat(64));
		const secondTarget = event('8'.repeat(64));
		const harness = createHarness();

		await harness.controller.openQuote(eventToPost(firstTarget));
		expect(harness.controller.isOpen).toBe(true);
		expect(harness.controller.isQuoteMode).toBe(true);
		expect(harness.controller.quoteTargetPost?.id).toBe(firstTarget.id);
		expect(harness.focusTextarea).toHaveBeenCalledOnce();

		harness.controller.content = 'Draft quote';
		harness.controller.close();
		await harness.controller.openQuote(eventToPost(firstTarget));
		expect(harness.controller.content).toBe('Draft quote');

		await harness.controller.openQuote(eventToPost(secondTarget));
		expect(harness.controller.content).toBe('');

		harness.controller.content = 'Another draft';
		await harness.controller.open();
		expect(harness.controller.isQuoteMode).toBe(false);
		expect(harness.controller.quoteTargetPost).toBeNull();
		expect(harness.controller.content).toBe('');
	});

	test('publishes a quote repost with target read relays and clears quote mode on success', async () => {
		const target = event('9'.repeat(64));
		const post = eventToPost(target);
		const harness = createHarness();
		publishQuoteRepost.mockResolvedValueOnce({
			ok: true,
			event: event('f'.repeat(64), { pubkey, content: 'Published quote' })
		});

		await harness.controller.openQuote(post);
		harness.controller.content = 'Published quote';
		await harness.controller.publish();

		expect(harness.getTargetReadRelays).toHaveBeenCalledWith(targetPubkey);
		expect(publishQuoteRepost).toHaveBeenCalledWith(
			'Published quote',
			target,
			pubkey,
			expect.anything(),
			[targetRelay],
			{ includeClientTag: true }
		);
		expect(harness.controller.isOpen).toBe(false);
		expect(harness.controller.isQuoteMode).toBe(false);
		expect(harness.controller.content).toBe('');
	});

	test('keeps the quote draft visible when publishing fails', async () => {
		const target = event('a'.repeat(64));
		const harness = createHarness();
		publishQuoteRepost.mockResolvedValueOnce({ ok: false, reason: 'relay-failed' });

		await harness.controller.openQuote(eventToPost(target));
		harness.controller.content = 'Keep this quote';
		await harness.controller.publish();

		expect(harness.controller.isOpen).toBe(true);
		expect(harness.controller.isQuoteMode).toBe(true);
		expect(harness.controller.content).toBe('Keep this quote');
		expect(harness.controller.hasError).toBe(true);
	});

	test('does not open quote mode for unsupported or unauthenticated targets', async () => {
		const unauthenticated = createHarness({ getAccountPubkey: () => null });
		await unauthenticated.controller.openQuote(eventToPost(event('b'.repeat(64))));
		expect(unauthenticated.controller.isOpen).toBe(false);

		const unsupported = createHarness();
		await unsupported.controller.openQuote(eventToPost(event('c'.repeat(64), { kind: Reaction })));
		expect(unsupported.controller.isOpen).toBe(false);
	});

	test('keeps selected images local until publishing', async () => {
		const harness = createHarness();

		await harness.controller.open();
		harness.controller.addMediaFiles([file('first.png')]);

		expect(harness.controller.mediaAttachments).toHaveLength(1);
		expect(harness.controller.mediaAttachments[0]).toMatchObject({
			name: 'first.png',
			status: 'selected'
		});
		expect(harness.uploadMedia).not.toHaveBeenCalled();
		expect(harness.controller.canSubmit).toBe(true);
	});

	test('uploads selected images one by one and appends their URLs before publishing', async () => {
		const uploadMedia = vi
			.fn()
			.mockResolvedValueOnce(uploaded('https://blossom.band/first.webp'))
			.mockResolvedValueOnce(
				uploaded('https://blossom.band/second.webp')
			) as unknown as UploadMedia & ReturnType<typeof vi.fn>;
		const harness = createHarness({ uploadMedia });
		publishShortTextNote.mockResolvedValueOnce({
			ok: true,
			event: event('f'.repeat(64), { pubkey, content: 'Published post' })
		});

		await harness.controller.open();
		harness.controller.content = 'Post body';
		harness.controller.addMediaFiles([file('first.png'), file('second.png')]);
		await harness.controller.publish();

		expect(uploadMedia).toHaveBeenCalledTimes(2);
		expect(uploadMedia.mock.calls[0][0].name).toBe('first.png');
		expect(uploadMedia.mock.calls[1][0].name).toBe('second.png');
		expect(publishShortTextNote).toHaveBeenCalledWith(
			'Post body\nhttps://blossom.band/first.webp\nhttps://blossom.band/second.webp',
			pubkey,
			expect.anything(),
			{ includeClientTag: true }
		);
		expect(harness.controller.isOpen).toBe(false);
		expect(harness.controller.mediaAttachments).toHaveLength(0);
	});

	test('uploads selected images and appends their URLs before publishing a channel message', async () => {
		const uploadMedia = vi
			.fn()
			.mockResolvedValueOnce(
				uploaded('https://blossom.band/channel.webp')
			) as unknown as UploadMedia & ReturnType<typeof vi.fn>;
		const harness = createHarness();
		const channelMedia = createMediaAttachmentController({ uploadMedia });
		publishChannelMessage.mockResolvedValueOnce({
			ok: true,
			event: event('f'.repeat(64), { pubkey, content: 'Published channel message' })
		});

		channelMedia.addMediaFiles([file('channel.png')]);
		await harness.controller.publishChannel(channel, 'Channel body', channelMedia);

		expect(uploadMedia).toHaveBeenCalledOnce();
		expect(publishChannelMessage).toHaveBeenCalledWith(
			'Channel body\nhttps://blossom.band/channel.webp',
			channel.channelId,
			pubkey,
			expect.anything(),
			['wss://channel.example/'],
			{ includeClientTag: true }
		);
	});

	test('does not publish a channel message when Blossom upload fails', async () => {
		const uploadMedia = vi.fn(async () => ({
			ok: false as const,
			reason: 'upload-failed' as const,
			message: 'Upload failed'
		})) as unknown as UploadMedia & ReturnType<typeof vi.fn>;
		const harness = createHarness();
		const channelMedia = createMediaAttachmentController({ uploadMedia });

		channelMedia.addMediaFiles([file('channel.png')]);
		const result = await harness.controller.publishChannel(
			channel,
			'Keep this channel draft',
			channelMedia
		);

		expect(result).toEqual({ ok: false, reason: 'relay-failed' });
		expect(publishChannelMessage).not.toHaveBeenCalled();
		expect(channelMedia.mediaAttachments[0]).toMatchObject({
			status: 'failed',
			errorReason: 'upload-failed',
			errorMessage: 'Upload failed'
		});
	});

	test('does not publish when Blossom upload fails and keeps the draft', async () => {
		const uploadMedia = vi.fn(async () => ({
			ok: false as const,
			reason: 'upload-failed' as const,
			message: 'Too large'
		})) as unknown as UploadMedia & ReturnType<typeof vi.fn>;
		const harness = createHarness({ uploadMedia });

		await harness.controller.open();
		harness.controller.content = 'Keep this post';
		harness.controller.addMediaFiles([file('first.png')]);
		await harness.controller.publish();

		expect(publishShortTextNote).not.toHaveBeenCalled();
		expect(harness.controller.isOpen).toBe(true);
		expect(harness.controller.content).toBe('Keep this post');
		expect(harness.controller.hasError).toBe(true);
		expect(harness.controller.mediaAttachments[0]).toMatchObject({
			status: 'failed',
			errorReason: 'upload-failed',
			errorMessage: 'Too large'
		});
	});

	test('marks invalid selected images as failed', async () => {
		const harness = createHarness();

		await harness.controller.open();
		harness.controller.addMediaFiles([
			file('note.txt', { type: 'text/plain' }),
			file('huge.png', { size: 20 * 1024 * 1024 + 1 })
		]);

		expect(harness.controller.mediaAttachments).toMatchObject([
			{ name: 'note.txt', status: 'failed', errorReason: 'unsupported-file' },
			{ name: 'huge.png', status: 'failed', errorReason: 'file-too-large' }
		]);
		expect(harness.controller.canSubmit).toBe(false);
	});

	test('accepts only the first ten selected images and records an overflow notice', async () => {
		const harness = createHarness();

		await harness.controller.open();
		harness.controller.addMediaFiles(
			Array.from({ length: 12 }, (_, index) => file(`image-${index}.png`))
		);

		expect(harness.controller.mediaAttachments).toHaveLength(10);
		expect(harness.controller.mediaAttachments.at(-1)?.name).toBe('image-9.png');
		expect(harness.controller.mediaNotice).toBe('media-count-exceeded:2');
	});
});
