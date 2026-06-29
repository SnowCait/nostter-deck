import { ChannelMessage, Reaction, Repost, ShortTextNote } from 'nostr-tools/kinds';
import type { EventSigner } from 'rx-nostr';
import { of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import {
	publishChannelMessage,
	publishEmojiReaction,
	publishLikeReaction,
	publishRepost,
	publishShortTextNote
} from './publish';

const send = vi.hoisted(() => vi.fn());

vi.mock('./client', () => ({
	getNostrClient: () => ({ send })
}));

const pubkey = 'a'.repeat(64);
const targetPubkey = 'c'.repeat(64);
const targetEventId = 'd'.repeat(64);
const channelId = 'b'.repeat(64);
const channelRelay = 'wss://channel.example/';
const targetRelay = 'wss://target.example/';
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
	});

	afterEach(() => {
		vi.clearAllMocks();
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
			on: { defaultWriteRelays: true, relays: [channelRelay] },
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
			on: { defaultWriteRelays: true, relays: [targetRelay] },
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
