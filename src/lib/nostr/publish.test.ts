import { ChannelMessage } from 'nostr-tools/kinds';
import { of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { Nip07Signer } from './auth.svelte';
import { publishChannelMessage } from './publish';

const send = vi.hoisted(() => vi.fn());

vi.mock('./client', () => ({
	getNostrClient: () => ({ send })
}));

const pubkey = 'a'.repeat(64);
const channelId = 'b'.repeat(64);
const channelRelay = 'wss://channel.example/';

function createSigner(): Nip07Signer {
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
			publishChannelMessage('Hello channel', channelId, pubkey, signer, [channelRelay])
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
			on: { defaultWriteRelays: true, relays: [channelRelay] }
		});
	});
});
