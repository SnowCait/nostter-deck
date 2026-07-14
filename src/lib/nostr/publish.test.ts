import { ChannelMessage, Reaction, Repost, ShortTextNote } from 'nostr-tools/kinds';
import { nprofileEncode, npubEncode } from 'nostr-tools/nip19';
import type { EventSigner } from 'rx-nostr';
import { of, throwError, TimeoutError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import {
	publishChannelMessage,
	publishEmojiReaction,
	publishLikeReaction,
	publishQuoteRepost,
	publishReply,
	publishRepost,
	publishShortTextNote
} from './publish';

const send = vi.hoisted(() => vi.fn());
const getDefaultRelays = vi.hoisted(() => vi.fn());

vi.mock('./client', () => ({
	getNostrClient: () => ({ getDefaultRelays, send })
}));

const pubkey = 'a'.repeat(64);
const targetPubkey = 'c'.repeat(64);
const targetEventId = 'd'.repeat(64);
const channelId = 'b'.repeat(64);
const channelRelay = 'wss://channel.example/';
const defaultWriteRelay = 'wss://default.example/';
const targetRelay = 'wss://target.example/';
const mentionedPubkey = 'e'.repeat(64);
const nostterClientTag = [
	'client',
	'nostter deck',
	'31990:83d52b4363d2d1bc5a098de7be67c120bfb7c0cee8efefd8eb6e42372af24689:1782011724356',
	'wss://yabu.me/'
];

function createSigner(): EventSigner {
	return {
		getPublicKey: vi.fn(async () => pubkey),
		signEvent: vi.fn(async (event) => ({
			...event,
			id: 'f'.repeat(64),
			pubkey,
			sig: '0'.repeat(128)
		}))
	};
}

describe('channel publishing', () => {
	beforeEach(() => {
		send.mockReset();
		send.mockReturnValue(of({ ok: true }));
		getDefaultRelays.mockReset();
		getDefaultRelays.mockReturnValue({
			[defaultWriteRelay]: { url: defaultWriteRelay.slice(0, -1), read: true, write: true }
		});
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.clearAllMocks();
	});

	test('returns the original signing rejection without publishing', async () => {
		const signingError = new Error('signer unavailable');
		const signer = createSigner();
		vi.mocked(signer.signEvent).mockRejectedValueOnce(signingError);

		await expect(publishShortTextNote('Keep draft', pubkey, signer)).resolves.toEqual({
			ok: false,
			reason: 'signing-failed',
			stage: 'signing',
			targetRelayCount: 1,
			internalError: signingError
		});
		expect(send).not.toHaveBeenCalled();
	});

	test('times out a signing request that never settles', async () => {
		vi.useFakeTimers();
		const signer = createSigner();
		vi.mocked(signer.signEvent).mockReturnValueOnce(new Promise(() => undefined));

		const resultPromise = publishShortTextNote('Keep draft', pubkey, signer, {
			signingTimeoutMs: 50
		});
		await vi.advanceTimersByTimeAsync(50);

		await expect(resultPromise).resolves.toMatchObject({
			ok: false,
			reason: 'signing-timeout',
			stage: 'signing',
			targetRelayCount: 1,
			internalError: { name: 'SigningTimeoutError' }
		});
		expect(send).not.toHaveBeenCalled();
	});

	test('rejects an event signed by a different account', async () => {
		const signer = createSigner();
		vi.mocked(signer.signEvent).mockResolvedValueOnce({
			kind: ShortTextNote,
			tags: [],
			content: 'Keep draft',
			created_at: 1,
			id: 'f'.repeat(64),
			pubkey: targetPubkey,
			sig: '0'.repeat(128)
		});

		await expect(publishShortTextNote('Keep draft', pubkey, signer)).resolves.toEqual({
			ok: false,
			reason: 'account-mismatch',
			stage: 'signing',
			targetRelayCount: 1
		});
		expect(send).not.toHaveBeenCalled();
	});

	test('distinguishes relay rejection, timeout, and publishing failure', async () => {
		send
			.mockReturnValueOnce(of({ ok: false, done: true }))
			.mockReturnValueOnce(throwError(() => new TimeoutError()))
			.mockReturnValueOnce(throwError(() => new Error('socket closed')));

		await expect(publishShortTextNote('Rejected', pubkey, createSigner())).resolves.toMatchObject({
			ok: false,
			reason: 'relay-rejected',
			stage: 'publishing',
			targetRelayCount: 1
		});
		await expect(publishShortTextNote('Timed out', pubkey, createSigner())).resolves.toMatchObject({
			ok: false,
			reason: 'relay-timeout',
			stage: 'publishing',
			targetRelayCount: 1
		});
		await expect(publishShortTextNote('Failed', pubkey, createSigner())).resolves.toMatchObject({
			ok: false,
			reason: 'relay-failed',
			stage: 'publishing',
			targetRelayCount: 1
		});
	});

	test('publishes a NIP-28 channel root message to default write and channel relays', async () => {
		const signer = createSigner();

		await expect(
			publishChannelMessage('Hello channel', channelId, pubkey, signer, [channelRelay], {
				includeClientTag: false
			})
		).resolves.toMatchObject({ ok: true, event: { kind: ChannelMessage } });
		expect(signer.signEvent).toHaveBeenCalledWith(
			expect.objectContaining({
				kind: ChannelMessage,
				tags: [['e', channelId, '', 'root']],
				content: 'Hello channel'
			})
		);
		expect(send).toHaveBeenCalledWith(expect.objectContaining({ kind: ChannelMessage, pubkey }), {
			completeOn: 'all-ok',
			errorOnTimeout: true,
			on: { relays: [defaultWriteRelay, channelRelay] },
			signer: expect.objectContaining({
				getPublicKey: expect.any(Function),
				signEvent: expect.any(Function)
			})
		});
	});

	test('deduplicates normalized default write and explicit relay URLs', async () => {
		await publishChannelMessage('Hello channel', channelId, pubkey, createSigner(), [
			defaultWriteRelay
		]);

		expect(send).toHaveBeenCalledWith(expect.objectContaining({ kind: ChannelMessage, pubkey }), {
			completeOn: 'all-ok',
			errorOnTimeout: true,
			on: { relays: [defaultWriteRelay] },
			signer: expect.objectContaining({
				getPublicKey: expect.any(Function),
				signEvent: expect.any(Function)
			})
		});
	});

	test('adds client information to main posts when enabled', async () => {
		const signer = createSigner();

		await expect(
			publishShortTextNote('Hello main', pubkey, signer, { includeClientTag: true })
		).resolves.toMatchObject({ ok: true, event: { kind: ShortTextNote } });
		expect(signer.signEvent).toHaveBeenCalledWith(
			expect.objectContaining({
				kind: ShortTextNote,
				tags: [[...nostterClientTag]],
				content: 'Hello main'
			})
		);
	});

	test('adds client information after the channel root tag when enabled', async () => {
		const signer = createSigner();

		await expect(
			publishChannelMessage('Hello channel', channelId, pubkey, signer, [channelRelay], {
				includeClientTag: true
			})
		).resolves.toMatchObject({ ok: true, event: { kind: ChannelMessage } });
		expect(signer.signEvent).toHaveBeenCalledWith(
			expect.objectContaining({
				kind: ChannelMessage,
				tags: [['e', channelId, '', 'root'], [...nostterClientTag]],
				content: 'Hello channel'
			})
		);
	});

	test('adds deduplicated mention p tags before client information to main and channel posts', async () => {
		const mentionContent = `Hello nostr:${npubEncode(mentionedPubkey)} nostr:${nprofileEncode({ pubkey: mentionedPubkey, relays: ['wss://profile.example/'] })}`;
		const mainSigner = createSigner();
		const channelSigner = createSigner();

		await publishShortTextNote(mentionContent, pubkey, mainSigner, { includeClientTag: true });
		await publishChannelMessage(mentionContent, channelId, pubkey, channelSigner, [channelRelay], {
			includeClientTag: true
		});

		expect(mainSigner.signEvent).toHaveBeenCalledWith(
			expect.objectContaining({
				tags: [['p', mentionedPubkey], [...nostterClientTag]],
				content: mentionContent
			})
		);
		expect(channelSigner.signEvent).toHaveBeenCalledWith(
			expect.objectContaining({
				tags: [['e', channelId, '', 'root'], ['p', mentionedPubkey], [...nostterClientTag]],
				content: mentionContent
			})
		);
	});

	test('publishes a NIP-10 reply to default write and target read relays', async () => {
		const signer = createSigner();

		await expect(
			publishReply(
				'Hello reply',
				{
					id: targetEventId,
					pubkey: targetPubkey,
					created_at: 100,
					kind: ShortTextNote,
					tags: [],
					content: 'Target',
					sig: '0'.repeat(128)
				},
				pubkey,
				signer,
				[targetRelay],
				{ includeClientTag: true }
			)
		).resolves.toMatchObject({ ok: true, event: { kind: ShortTextNote } });
		expect(signer.signEvent).toHaveBeenCalledWith(
			expect.objectContaining({
				kind: ShortTextNote,
				tags: [
					['e', targetEventId, targetRelay, 'root', targetPubkey],
					['p', targetPubkey, targetRelay],
					[...nostterClientTag]
				],
				content: 'Hello reply'
			})
		);
		expect(send).toHaveBeenCalledWith(expect.objectContaining({ kind: ShortTextNote, pubkey }), {
			completeOn: 'all-ok',
			errorOnTimeout: true,
			on: { relays: [defaultWriteRelay, targetRelay] },
			signer: expect.objectContaining({
				getPublicKey: expect.any(Function),
				signEvent: expect.any(Function)
			})
		});
	});

	test('keeps an existing reply p tag and adds only new content mentions', async () => {
		const signer = createSigner();
		const content = `Hello nostr:${npubEncode(targetPubkey)} nostr:${npubEncode(mentionedPubkey)}`;

		await publishReply(
			content,
			{
				id: targetEventId,
				pubkey: targetPubkey,
				created_at: 100,
				kind: ShortTextNote,
				tags: [],
				content: 'Target',
				sig: '0'.repeat(128)
			},
			pubkey,
			signer,
			[targetRelay],
			{ includeClientTag: true }
		);

		expect(signer.signEvent).toHaveBeenCalledWith(
			expect.objectContaining({
				tags: [
					['e', targetEventId, targetRelay, 'root', targetPubkey],
					['p', targetPubkey, targetRelay],
					['p', mentionedPubkey],
					[...nostterClientTag]
				]
			})
		);
	});

	test('publishes a NIP-18 quote repost with a q tag and NIP-21 reference', async () => {
		const signer = createSigner();
		const target = {
			id: targetEventId,
			pubkey: targetPubkey,
			created_at: 100,
			kind: ShortTextNote,
			tags: [],
			content: 'Target',
			sig: '0'.repeat(128)
		};

		await expect(
			publishQuoteRepost('Hello quote', target, pubkey, signer, [targetRelay], {
				includeClientTag: true
			})
		).resolves.toMatchObject({ ok: true, event: { kind: ShortTextNote } });
		expect(signer.signEvent).toHaveBeenCalledWith(
			expect.objectContaining({
				kind: ShortTextNote,
				tags: [['q', targetEventId, targetRelay, targetPubkey], [...nostterClientTag]],
				content: expect.stringMatching(/^Hello quote\n\nnostr:nevent/)
			})
		);
		expect(send).toHaveBeenCalledWith(expect.objectContaining({ kind: ShortTextNote, pubkey }), {
			completeOn: 'all-ok',
			errorOnTimeout: true,
			on: { relays: [defaultWriteRelay, targetRelay] },
			signer: expect.objectContaining({
				getPublicKey: expect.any(Function),
				signEvent: expect.any(Function)
			})
		});
	});

	test('adds content mention p tags to quote reposts without tagging the nevent reference', async () => {
		const signer = createSigner();
		const target = {
			id: targetEventId,
			pubkey: targetPubkey,
			created_at: 100,
			kind: ShortTextNote,
			tags: [],
			content: 'Target',
			sig: '0'.repeat(128)
		};

		await publishQuoteRepost(`Hello nostr:${npubEncode(mentionedPubkey)}`, target, pubkey, signer, [
			targetRelay
		]);

		expect(signer.signEvent).toHaveBeenCalledWith(
			expect.objectContaining({
				tags: [
					['q', targetEventId, targetRelay, targetPubkey],
					['p', mentionedPubkey]
				]
			})
		);
	});

	test('publishes a NIP-25 like reaction to default write and target read relays', async () => {
		const signer = createSigner();

		await expect(
			publishLikeReaction(
				{ id: targetEventId, pubkey: targetPubkey, kind: ShortTextNote },
				pubkey,
				signer,
				[targetRelay],
				{ includeClientTag: true }
			)
		).resolves.toMatchObject({ ok: true, event: { kind: Reaction } });
		expect(signer.signEvent).toHaveBeenCalledWith(
			expect.objectContaining({
				kind: Reaction,
				tags: [
					['e', targetEventId, targetRelay, targetPubkey],
					['p', targetPubkey, targetRelay],
					['k', String(ShortTextNote)],
					[...nostterClientTag]
				],
				content: '+'
			})
		);
		expect(send).toHaveBeenCalledWith(expect.objectContaining({ kind: Reaction, pubkey }), {
			completeOn: 'all-ok',
			errorOnTimeout: true,
			on: { relays: [defaultWriteRelay, targetRelay] },
			signer: expect.objectContaining({
				getPublicKey: expect.any(Function),
				signEvent: expect.any(Function)
			})
		});
	});

	test('keeps the target pubkey in the NIP-25 e tag without a relay hint', async () => {
		const signer = createSigner();

		await expect(
			publishLikeReaction(
				{ id: targetEventId, pubkey: targetPubkey, kind: ShortTextNote },
				pubkey,
				signer,
				[],
				{ includeClientTag: false }
			)
		).resolves.toMatchObject({ ok: true, event: { kind: Reaction } });
		expect(signer.signEvent).toHaveBeenCalledWith(
			expect.objectContaining({
				kind: Reaction,
				tags: [
					['e', targetEventId, '', targetPubkey],
					['p', targetPubkey],
					['k', String(ShortTextNote)]
				],
				content: '+'
			})
		);
	});

	test('publishes a Unicode NIP-25 like reaction when configured', async () => {
		const signer = createSigner();

		await expect(
			publishLikeReaction(
				{ id: targetEventId, pubkey: targetPubkey, kind: ShortTextNote },
				pubkey,
				signer,
				[targetRelay],
				{ reaction: { type: 'unicode', emoji: '⭐' } }
			)
		).resolves.toMatchObject({ ok: true, event: { kind: Reaction } });
		expect(signer.signEvent).toHaveBeenCalledWith(
			expect.objectContaining({
				kind: Reaction,
				tags: [
					['e', targetEventId, targetRelay, targetPubkey],
					['p', targetPubkey, targetRelay],
					['k', String(ShortTextNote)]
				],
				content: '⭐'
			})
		);
	});

	test('publishes a custom NIP-25 like reaction with an emoji tag when configured', async () => {
		const signer = createSigner();
		const address = `30030:${pubkey}:nostter`;

		await expect(
			publishLikeReaction(
				{ id: targetEventId, pubkey: targetPubkey, kind: ShortTextNote },
				pubkey,
				signer,
				[targetRelay],
				{
					includeClientTag: true,
					reaction: {
						type: 'custom',
						shortcode: 'blobcat',
						url: 'https://emoji.example/blobcat.png',
						address
					}
				}
			)
		).resolves.toMatchObject({ ok: true, event: { kind: Reaction } });
		expect(signer.signEvent).toHaveBeenCalledWith(
			expect.objectContaining({
				kind: Reaction,
				tags: [
					['e', targetEventId, targetRelay, targetPubkey],
					['p', targetPubkey, targetRelay],
					['k', String(ShortTextNote)],
					['emoji', 'blobcat', 'https://emoji.example/blobcat.png', address],
					[...nostterClientTag]
				],
				content: ':blobcat:'
			})
		);
	});

	test('publishes a NIP-18 repost without relay hints or embedded content', async () => {
		const signer = createSigner();

		await expect(
			publishRepost({ id: targetEventId, pubkey: targetPubkey }, pubkey, signer, {
				includeClientTag: true
			})
		).resolves.toMatchObject({ ok: true, event: { kind: Repost } });
		expect(signer.signEvent).toHaveBeenCalledWith(
			expect.objectContaining({
				kind: Repost,
				tags: [['e', targetEventId], ['p', targetPubkey], [...nostterClientTag]],
				content: ''
			})
		);
		expect(send).toHaveBeenCalledWith(expect.objectContaining({ kind: Repost, pubkey }), {
			completeOn: 'all-ok',
			errorOnTimeout: true,
			signer: expect.objectContaining({
				getPublicKey: expect.any(Function),
				signEvent: expect.any(Function)
			})
		});
	});

	test('publishes a Unicode NIP-25 emoji reaction', async () => {
		const signer = createSigner();

		await expect(
			publishEmojiReaction(
				{ id: targetEventId, pubkey: targetPubkey, kind: ShortTextNote },
				{ type: 'unicode', emoji: '🔥' },
				pubkey,
				signer,
				[targetRelay],
				{ includeClientTag: false }
			)
		).resolves.toMatchObject({ ok: true, event: { kind: Reaction } });
		expect(signer.signEvent).toHaveBeenCalledWith(
			expect.objectContaining({
				kind: Reaction,
				tags: [
					['e', targetEventId, targetRelay, targetPubkey],
					['p', targetPubkey, targetRelay],
					['k', String(ShortTextNote)]
				],
				content: '🔥'
			})
		);
	});

	test('publishes a custom NIP-25 emoji reaction with an emoji tag', async () => {
		const signer = createSigner();
		const address = `30030:${pubkey}:nostter`;

		await expect(
			publishEmojiReaction(
				{ id: targetEventId, pubkey: targetPubkey, kind: ShortTextNote },
				{
					type: 'custom',
					shortcode: 'blobcat',
					url: 'https://emoji.example/blobcat.png',
					address
				},
				pubkey,
				signer,
				[targetRelay],
				{ includeClientTag: true }
			)
		).resolves.toMatchObject({ ok: true, event: { kind: Reaction } });
		expect(signer.signEvent).toHaveBeenCalledWith(
			expect.objectContaining({
				kind: Reaction,
				tags: [
					['e', targetEventId, targetRelay, targetPubkey],
					['p', targetPubkey, targetRelay],
					['k', String(ShortTextNote)],
					['emoji', 'blobcat', 'https://emoji.example/blobcat.png', address],
					[...nostterClientTag]
				],
				content: ':blobcat:'
			})
		);
	});
});
