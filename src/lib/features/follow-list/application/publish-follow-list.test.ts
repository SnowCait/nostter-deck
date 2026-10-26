import type { EventSigner } from 'rx-nostr';
import { Contacts } from 'nostr-tools/kinds';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { FollowListUpdate } from '../domain/follow-actions';

const publishEvent = vi.hoisted(() => vi.fn());

vi.mock('$lib/nostr/relay/publish-event', () => ({ publishEvent }));

import { publishFollowList } from './publish-follow-list';

describe('publishFollowList', () => {
	beforeEach(() => {
		publishEvent.mockReset();
	});

	test('passes the unchanged kind 3 template to shared publishing and returns its result', async () => {
		const update: FollowListUpdate = {
			kind: Contacts,
			tags: [
				['p', 'a'.repeat(64), 'wss://relay.example/', 'friend', 'extra'],
				['client', 'existing']
			],
			content: 'preserve this content'
		};
		const pubkey = 'b'.repeat(64);
		const signer = {} as EventSigner;
		const createdAt = 1_700_000_000;
		const result = { ok: true, event: { kind: Contacts } };
		publishEvent.mockResolvedValue(result);

		await expect(publishFollowList(update, pubkey, signer, createdAt)).resolves.toBe(result);
		expect(publishEvent).toHaveBeenCalledExactlyOnceWith(
			{
				kind: Contacts,
				tags: update.tags,
				content: update.content,
				created_at: createdAt
			},
			pubkey,
			signer
		);
	});
});
