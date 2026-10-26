import type * as Nostr from 'nostr-typedef';
import { Contacts } from 'nostr-tools/kinds';
import type { EventSigner } from 'rx-nostr';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { FollowListUpdate } from '../domain/follow-actions';
import { publishAndCacheFollowList } from './publish-and-cache-follow-list';
import { publishFollowList } from './publish-follow-list';
import { getCachedLatestEvent, putCachedLatestEvent } from '$lib/nostr/latest-event-cache';
import type { PublishPostResult } from '$lib/nostr/relay/publish-event';

vi.mock('./publish-follow-list', () => ({ publishFollowList: vi.fn() }));
vi.mock('$lib/nostr/latest-event-cache', () => ({
	getCachedLatestEvent: vi.fn(),
	putCachedLatestEvent: vi.fn()
}));

const currentTime = 1_700_000_000;
const pubkey = 'a'.repeat(64);
const signer = {} as EventSigner;
const update: FollowListUpdate = { kind: Contacts, tags: [['p', 'b'.repeat(64), '']], content: '' };

function signedEvent(createdAt: number): Nostr.Event<typeof Contacts> {
	return {
		...update,
		pubkey,
		created_at: createdAt,
		id: 'c'.repeat(64),
		sig: 'd'.repeat(128)
	};
}

describe('publishAndCacheFollowList', () => {
	beforeEach(() => {
		vi.resetAllMocks();
		vi.useFakeTimers();
		vi.setSystemTime(currentTime * 1_000);
		vi.mocked(getCachedLatestEvent).mockResolvedValue(undefined);
		vi.mocked(putCachedLatestEvent).mockResolvedValue('inserted');
		vi.mocked(publishFollowList).mockImplementation(
			async (_update, _pubkey, _signer, createdAt) => ({
				ok: true,
				event: signedEvent(createdAt)
			})
		);
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	test.each([
		{ cachedAt: undefined, previousAttempt: undefined, expected: currentTime },
		{ cachedAt: currentTime, previousAttempt: undefined, expected: currentTime + 1 },
		{ cachedAt: currentTime + 10, previousAttempt: currentTime + 20, expected: currentTime + 21 },
		{ cachedAt: currentTime + 20, previousAttempt: currentTime + 10, expected: currentTime + 21 },
		{ cachedAt: currentTime - 10, previousAttempt: currentTime - 5, expected: currentTime }
	])(
		'uses $expected with cached time $cachedAt and previous attempt $previousAttempt',
		async ({ cachedAt, previousAttempt, expected }) => {
			vi.mocked(getCachedLatestEvent).mockResolvedValue(
				cachedAt === undefined ? undefined : signedEvent(cachedAt)
			);

			const result = await publishAndCacheFollowList(update, pubkey, signer, previousAttempt);

			expect(getCachedLatestEvent).toHaveBeenCalledExactlyOnceWith([pubkey, Contacts, '']);
			expect(publishFollowList).toHaveBeenCalledExactlyOnceWith(update, pubkey, signer, expected);
			expect(result.createdAt).toBe(expected);
		}
	);

	test.each(['inserted', 'updated', 'ignored'] as const)(
		'saves the signed event after publishing and preserves the %s cache result',
		async (status) => {
			const publishResult: PublishPostResult = { ok: true, event: signedEvent(currentTime) };
			vi.mocked(publishFollowList).mockResolvedValue(publishResult);
			vi.mocked(putCachedLatestEvent).mockResolvedValue(status);

			const result = await publishAndCacheFollowList(update, pubkey, signer);

			expect(putCachedLatestEvent).toHaveBeenCalledExactlyOnceWith(publishResult.event);
			expect(result.publishResult).toBe(publishResult);
			expect(result.cacheResult).toEqual({ status });
		}
	);

	test.each([
		{ reason: 'signing-failed', stage: 'signing' },
		{ reason: 'relay-rejected', stage: 'publishing' }
	] as const)(
		'does not save after $reason and returns the attempt time',
		async ({ reason, stage }) => {
			const publishResult: PublishPostResult = { ok: false, reason, stage, targetRelayCount: 1 };
			vi.mocked(publishFollowList).mockResolvedValue(publishResult);

			const result = await publishAndCacheFollowList(update, pubkey, signer, currentTime);

			expect(result).toEqual({
				publishResult,
				createdAt: currentTime + 1,
				cacheResult: { status: 'not-attempted' }
			});
			expect(publishFollowList).toHaveBeenCalledExactlyOnceWith(
				update,
				pubkey,
				signer,
				currentTime + 1
			);
			expect(putCachedLatestEvent).not.toHaveBeenCalled();
		}
	);

	test('propagates cache read failure before publishing', async () => {
		const error = new Error('Cache read failed');
		vi.mocked(getCachedLatestEvent).mockRejectedValue(error);

		await expect(publishAndCacheFollowList(update, pubkey, signer)).rejects.toBe(error);
		expect(publishFollowList).not.toHaveBeenCalled();
		expect(putCachedLatestEvent).not.toHaveBeenCalled();
	});

	test('reports cache write failure separately from successful publishing', async () => {
		const publishResult: PublishPostResult = { ok: true, event: signedEvent(currentTime) };
		const error = new Error('Cache write failed');
		vi.mocked(publishFollowList).mockResolvedValue(publishResult);
		vi.mocked(putCachedLatestEvent).mockRejectedValue(error);

		const result = await publishAndCacheFollowList(update, pubkey, signer);

		expect(result.publishResult).toBe(publishResult);
		expect(result.createdAt).toBe(currentTime);
		expect(result.cacheResult).toEqual({ status: 'failed', error });
	});
});
