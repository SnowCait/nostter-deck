import type * as Nostr from 'nostr-typedef';
import { Contacts } from 'nostr-tools/kinds';
import type { EventSigner } from 'rx-nostr';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { FollowListUpdate } from '../domain/follow-actions';
import { createFollowListController } from './follow-list-controller.svelte';
import { getLatestFollowList } from './follow-list';
import {
	publishAndCacheFollowList,
	type PublishAndCacheFollowListResult
} from './publish-and-cache-follow-list';
import { getCachedLatestEvent } from '$lib/nostr/latest-event-cache';

vi.mock('./follow-list', () => ({ getLatestFollowList: vi.fn() }));
vi.mock('./publish-and-cache-follow-list', () => ({ publishAndCacheFollowList: vi.fn() }));
vi.mock('$lib/nostr/latest-event-cache', () => ({ getCachedLatestEvent: vi.fn() }));

const owner = '1'.repeat(64);
const otherOwner = '2'.repeat(64);
const alice = 'a'.repeat(64);
const bob = 'b'.repeat(64);
const carol = 'c'.repeat(64);
const existing = 'e'.repeat(64);
const signer: EventSigner = { getPublicKey: vi.fn(), signEvent: vi.fn() };
const otherSigner: EventSigner = { getPublicKey: vi.fn(), signEvent: vi.fn() };
const account = { pubkey: owner, signer };
const otherAccount = { pubkey: otherOwner, signer: otherSigner };

function event(
	pubkey = owner,
	update: FollowListUpdate = {
		kind: Contacts,
		tags: [
			['p', existing, 'wss://hint.example/', 'friend', 'extra'],
			['custom', 'keep']
		],
		content: 'preserved content'
	},
	createdAt = 10
): Nostr.Event<typeof Contacts> {
	return { ...update, pubkey, created_at: createdAt, id: 'f'.repeat(64), sig: '0'.repeat(128) };
}

function harness() {
	const attempts: {
		update: FollowListUpdate;
		pubkey: string;
		signer: EventSigner;
		previous: number | undefined;
		completion: ReturnType<typeof Promise.withResolvers<PublishAndCacheFollowListResult>>;
	}[] = [];
	vi.mocked(publishAndCacheFollowList).mockImplementation((update, pubkey, signer, previous) => {
		const completion = Promise.withResolvers<PublishAndCacheFollowListResult>();
		attempts.push({ update, pubkey, signer, previous, completion });
		return completion.promise;
	});
	const controller = createFollowListController();

	async function succeed(
		index: number,
		cacheResult: PublishAndCacheFollowListResult['cacheResult'] = { status: 'updated' },
		createdAt = 100 + index
	) {
		const attempt = attempts[index];
		const result: PublishAndCacheFollowListResult = {
			publishResult: { ok: true, event: event(attempt.pubkey, attempt.update, createdAt) },
			createdAt,
			cacheResult
		};
		attempt.completion.resolve(result);
		await attempt.completion.promise;
		return result;
	}

	async function fail(index: number, stage: 'signing' | 'publishing', createdAt = 100 + index) {
		attempts[index].completion.resolve({
			publishResult: {
				ok: false,
				stage,
				reason: stage === 'signing' ? 'signing-failed' : 'relay-timeout',
				targetRelayCount: 2
			},
			createdAt,
			cacheResult: { status: 'not-attempted' }
		});
		await attempts[index].completion.promise;
	}

	return { controller, attempts, succeed, fail };
}

async function settleCacheRead() {
	await vi
		.mocked(getCachedLatestEvent)
		.mock.results.at(-1)!
		.value.catch(() => {});
	await Promise.resolve();
}

beforeEach(() => {
	vi.resetAllMocks();
	vi.mocked(getLatestFollowList).mockImplementation(async (pubkey) => event(pubkey));
	vi.mocked(getCachedLatestEvent).mockResolvedValue(undefined);
});

describe('follow list controller', () => {
	test('reflects the first operation synchronously and starts publishing without debounce', async () => {
		const { controller, attempts, succeed } = harness();
		await controller.setAccount(account);
		expect(controller.follow(existing)).toBe(false);
		expect(controller.unfollow(alice)).toBe(false);
		expect(controller.follow(alice)).toBe(true);
		expect(controller.isFollowing(alice)).toBe(true);
		expect(controller.isPublishing).toBe(true);
		expect(attempts).toHaveLength(1);
		expect(attempts[0]).toMatchObject({ pubkey: owner, previous: undefined });
		expect(attempts[0].signer).toBe(signer);
		expect(attempts[0].update).toEqual({
			kind: Contacts,
			tags: [...event().tags, ['p', alice, '']],
			content: event().content
		});
		expect(controller.follow(alice)).toBe(false);
		const result = await succeed(0);
		expect(controller.isPublishing).toBe(false);
		expect(controller.event).toEqual(result.publishResult.ok && result.publishResult.event);
		expect(attempts).toHaveLength(1);
	});

	test('coalesces operations into the latest desire without changing the in-flight payload', async () => {
		const { controller, attempts, succeed } = harness();
		await controller.setAccount(account);
		controller.follow(alice);
		controller.follow(bob);
		controller.unfollow(alice);
		expect(controller.isFollowing(alice)).toBe(false);
		expect(controller.isFollowing(bob)).toBe(true);
		expect(attempts).toHaveLength(1);
		expect(attempts[0].update.tags).toEqual([...event().tags, ['p', alice, '']]);
		await succeed(0, { status: 'updated' }, 123);
		expect(attempts).toHaveLength(2);
		expect(attempts[1].update.tags).toEqual([...event().tags, ['p', bob, '']]);
		expect(attempts[1].previous).toBe(123);
		expect(controller.isPublishing).toBe(true);
		await succeed(1);
		expect(controller.isPublishing).toBe(false);
		expect(attempts).toHaveLength(2);
	});

	test('skips another publish when intervening operations return to the sent state', async () => {
		const { controller, attempts, succeed } = harness();
		await controller.setAccount(account);
		controller.follow(alice);
		controller.follow(bob);
		controller.unfollow(bob);
		await succeed(0);
		expect(attempts).toHaveLength(1);
		expect(controller.desired).toEqual(attempts[0].update);
	});

	test.each([false, true])(
		'publishes subsequent changes after relay failure, including a reversion: %s',
		async (revert) => {
			const { controller, attempts, fail, succeed } = harness();
			await controller.setAccount(account);
			controller.follow(alice);
			if (revert) {
				controller.unfollow(alice);
			} else {
				controller.follow(bob);
			}
			await fail(0, 'publishing', 200);
			expect(attempts).toHaveLength(2);
			expect(attempts[1].previous).toBe(200);
			expect(attempts[1].update).toEqual(controller.desired);
			if (revert) {
				expect(attempts[1].update.tags).toEqual(event().tags);
			}
			await succeed(1);
			expect(controller.publishError).toBeNull();
		}
	);

	test('stops after relay failure without further changes and resumes on a later operation', async () => {
		const { controller, attempts, fail, succeed } = harness();
		await controller.setAccount(account);
		controller.follow(alice);
		await fail(0, 'publishing');
		expect(attempts).toHaveLength(1);
		expect(controller.isPublishing).toBe(false);
		expect(controller.publishError).toMatchObject({
			type: 'publish',
			result: { stage: 'publishing' }
		});
		expect(controller.isFollowing(alice)).toBe(true);
		controller.follow(bob);
		expect(attempts).toHaveLength(2);
		expect(attempts[1].previous).toBe(100);
		await succeed(1);
	});

	test('does not loop when an automatic follow-up also fails', async () => {
		const { controller, attempts, fail } = harness();
		await controller.setAccount(account);
		controller.follow(alice);
		controller.follow(bob);
		await fail(0, 'publishing');
		await fail(1, 'publishing');
		expect(attempts).toHaveLength(2);
		expect(controller.isPublishing).toBe(false);
		expect(controller.isFollowing(bob)).toBe(true);
	});

	test('pauses after signing failure and retries the retained latest desire only on request', async () => {
		const { controller, attempts, fail, succeed } = harness();
		await controller.setAccount(account);
		controller.follow(alice);
		controller.follow(bob);
		await fail(0, 'signing');
		controller.unfollow(alice);
		expect(attempts).toHaveLength(1);
		expect(controller.isFollowing(bob)).toBe(true);
		expect(controller.isPublishing).toBe(false);
		expect(controller.retry()).toBe(true);
		expect(controller.retry()).toBe(false);
		expect(attempts[1].update.tags).toEqual([...event().tags, ['p', bob, '']]);
		expect(attempts[1].previous).toBe(100);
		await succeed(1);
		expect(controller.publishError).toBeNull();
	});

	test('keeps a successful published basis and reports cache errors separately', async () => {
		const { controller, attempts, succeed } = harness();
		const error = new Error('Cache unavailable');
		await controller.setAccount(account);
		controller.follow(alice);
		const result = await succeed(0, { status: 'failed', error });
		expect(controller.event).toEqual(result.publishResult.ok && result.publishResult.event);
		expect(controller.publishError).toBeNull();
		expect(controller.cacheError).toBe(error);
		controller.follow(bob);
		expect(attempts[1].update.tags).toEqual([...event().tags, ['p', alice, ''], ['p', bob, '']]);
		expect(attempts[1].previous).toBe(100);
		await succeed(1);
		expect(controller.cacheError).toBeNull();
	});

	test('treats an ignored write of the same cached event as normal success', async () => {
		const { controller, attempts, succeed } = harness();
		await controller.setAccount(account);
		controller.follow(alice);
		const cached = event(owner, attempts[0].update, 100);
		vi.mocked(getCachedLatestEvent).mockResolvedValue(cached);
		await succeed(0, { status: 'ignored' });
		await settleCacheRead();
		expect(getCachedLatestEvent).toHaveBeenCalledExactlyOnceWith([owner, Contacts, '']);
		expect(controller.event).toEqual(cached);
		expect(controller.isPublishing).toBe(false);
		expect(controller.publishError).toBeNull();
		expect(attempts).toHaveLength(1);
	});

	test.each(['different', 'missing', 'rejected'] as const)(
		'stops on an ignored write when the cached event is %s and recovers only by reloading',
		async (mode) => {
			const { controller, attempts, succeed } = harness();
			await controller.setAccount(account);
			controller.follow(alice);
			controller.follow(bob);
			const newer = {
				...event(owner, { kind: Contacts, tags: [['p', carol]], content: 'remote' }, 200),
				id: '0'.repeat(64)
			};
			if (mode === 'different') {
				vi.mocked(getCachedLatestEvent).mockResolvedValue(newer);
			} else if (mode === 'rejected') {
				vi.mocked(getCachedLatestEvent).mockRejectedValue(new Error('Cache read failed'));
			}
			await succeed(0, { status: 'ignored' });
			await settleCacheRead();
			expect(controller.publishError).toMatchObject({ type: 'conflict' });
			expect(controller.cacheError).toBeNull();
			expect(controller.lastCreatedAt).toBe(100);
			expect(controller.isPublishing).toBe(false);
			const desired = controller.desired;
			expect(controller.follow(carol)).toBe(false);
			expect(controller.unfollow(existing)).toBe(false);
			expect(controller.retry()).toBe(false);
			expect(controller.desired).toEqual(desired);
			expect(attempts).toHaveLength(1);

			vi.mocked(getLatestFollowList).mockResolvedValueOnce(newer);
			await controller.reload();
			expect(getLatestFollowList).toHaveBeenCalledTimes(2);
			expect(controller.event).toEqual(newer);
			expect(controller.desired).toEqual({
				kind: Contacts,
				tags: newer.tags,
				content: newer.content
			});
			expect(controller.publishError).toBeNull();
			expect(controller.isFollowing(alice)).toBe(false);
			expect(controller.isFollowing(bob)).toBe(false);
			expect(attempts).toHaveLength(1);
			controller.follow(existing);
			expect(attempts[1].update.tags).toEqual([
				['p', carol],
				['p', existing, '']
			]);
			expect(attempts[1].previous).toBe(200);
			await succeed(1, { status: 'updated' }, 201);
		}
	);

	test('blocks operations queued during a cache reread once a different event is found', async () => {
		const { controller, attempts, succeed } = harness();
		const read = Promise.withResolvers<Nostr.Event<typeof Contacts> | undefined>();
		vi.mocked(getCachedLatestEvent).mockReturnValue(read.promise);
		await controller.setAccount(account);
		controller.follow(alice);
		await succeed(0, { status: 'ignored' });
		controller.follow(bob);
		read.resolve({ ...event(), id: '0'.repeat(64) });
		await settleCacheRead();
		expect(controller.publishError).toEqual({ type: 'conflict' });
		expect(controller.retry()).toBe(false);
		expect(attempts).toHaveLength(1);
	});

	test.each(['missing', 'rejected'] as const)(
		'keeps the conflict locked when reloading is %s',
		async (mode) => {
			const { controller, attempts, succeed } = harness();
			await controller.setAccount(account);
			controller.follow(alice);
			await succeed(0, { status: 'ignored' });
			await settleCacheRead();
			if (mode === 'missing') {
				vi.mocked(getLatestFollowList).mockResolvedValueOnce(undefined);
			} else {
				vi.mocked(getLatestFollowList).mockRejectedValueOnce(new Error('Reload failed'));
			}
			await controller.reload();
			expect(controller.status).toBe(mode === 'missing' ? 'unknown' : 'failed');
			expect(controller.publishError).toMatchObject({ type: 'conflict' });
			expect(controller.confirmEmptyFollowList()).toBe(false);
			expect(controller.follow(bob)).toBe(false);
			expect(controller.retry()).toBe(false);
			expect(attempts).toHaveLength(1);
			await controller.reload();
			expect(controller.status).toBe('ready');
			expect(controller.publishError).toBeNull();
			expect(controller.isFollowing(alice)).toBe(false);
		}
	);

	test('ignores a conflict reload result after switching accounts', async () => {
		const { controller, succeed } = harness();
		await controller.setAccount(account);
		controller.follow(alice);
		await succeed(0, { status: 'ignored' });
		await settleCacheRead();
		const fetched = Promise.withResolvers<Nostr.Event<typeof Contacts> | undefined>();
		const started = Promise.withResolvers<void>();
		vi.mocked(getLatestFollowList).mockImplementationOnce(() => {
			started.resolve();
			return fetched.promise;
		});
		const loading = controller.reload();
		await started.promise;
		await controller.setAccount(otherAccount);
		fetched.resolve(event(owner, { kind: Contacts, tags: [['p', carol]], content: 'old' }));
		await loading;
		expect(controller.pubkey).toBe(otherOwner);
		expect(controller.event?.pubkey).toBe(otherOwner);
		expect(controller.isFollowing(carol)).toBe(false);
		expect(controller.publishError).toBeNull();
	});

	test.each(['newer', 'missing'] as const)(
		'isolates a %s cache reread across account switches',
		async (mode) => {
			const { controller, attempts, succeed } = harness();
			const read = Promise.withResolvers<Nostr.Event<typeof Contacts> | undefined>();
			vi.mocked(getCachedLatestEvent).mockReturnValue(read.promise);
			await controller.setAccount(account);
			controller.follow(alice);
			await succeed(0, { status: 'ignored' });
			await controller.setAccount(otherAccount);
			controller.follow(bob);
			const latest = event(
				owner,
				{ kind: Contacts, tags: [['p', carol]], content: 'old account' },
				200
			);
			read.resolve(mode === 'newer' ? latest : undefined);
			await settleCacheRead();
			expect(controller.pubkey).toBe(otherOwner);
			expect(controller.event?.pubkey).toBe(otherOwner);
			expect(controller.isFollowing(carol)).toBe(false);
			expect(controller.publishError).toBeNull();
			expect(controller.isPublishing).toBe(true);
			expect(attempts).toHaveLength(2);
			await succeed(1);
			vi.mocked(getLatestFollowList).mockResolvedValueOnce(mode === 'newer' ? latest : undefined);
			await controller.setAccount(account);
			if (mode === 'newer') {
				expect(controller.event).toEqual(latest);
			} else {
				expect(controller.event).toBeUndefined();
				expect(controller.status).toBe('unknown');
				expect(controller.follow(carol)).toBe(false);
			}
		}
	);

	test.each(['throw', 'reject'] as const)(
		'recovers from a publishing API %s without automatic retry',
		async (mode) => {
			const { controller, attempts, succeed } = harness();
			const error = new Error('Cache read failed');
			await controller.setAccount(account);
			if (mode === 'throw') {
				vi.mocked(publishAndCacheFollowList).mockImplementationOnce(() => {
					throw error;
				});
			}
			controller.follow(alice);
			if (mode === 'reject') {
				controller.follow(bob);
				attempts[0].completion.reject(error);
				await attempts[0].completion.promise.catch(() => {});
			}
			expect(controller.isPublishing).toBe(false);
			expect(controller.publishError).toEqual({ type: 'exception', error });
			expect(controller.lastCreatedAt).toBeUndefined();
			expect(controller.isFollowing(alice)).toBe(true);
			expect(controller.retry()).toBe(true);
			await succeed(attempts.length - 1);
			expect(controller.isPublishing).toBe(false);
		}
	);

	test('blocks unknown bases and starts empty only after explicit independent confirmation', async () => {
		const fetched = Promise.withResolvers<Nostr.Event<typeof Contacts> | undefined>();
		vi.mocked(getLatestFollowList).mockReturnValue(fetched.promise);
		const { controller, attempts, succeed } = harness();
		const loading = controller.setAccount(account);
		expect(controller.status).toBe('loading');
		expect(controller.confirmEmptyFollowList()).toBe(false);
		expect(controller.follow(alice)).toBe(false);
		fetched.resolve(undefined);
		await loading;
		expect(controller.status).toBe('unknown');
		expect(controller.isFollowing(alice)).toBeUndefined();
		expect(controller.follow(alice)).toBe(false);
		expect(controller.unfollow(alice)).toBe(false);
		expect(attempts).toHaveLength(0);
		expect(controller.confirmEmptyFollowList()).toBe(true);
		controller.follow(alice);
		expect(attempts[0].update).toEqual({ kind: Contacts, tags: [['p', alice, '']], content: '' });
		await succeed(0);
	});

	test('retains load errors without publishing and permits reloading', async () => {
		const error = new Error('Initial cache unavailable');
		vi.mocked(getLatestFollowList).mockRejectedValueOnce(error);
		const { controller, attempts, succeed } = harness();
		await controller.setAccount(account);
		expect(controller.status).toBe('failed');
		expect(controller.loadError).toBe(error);
		expect(controller.follow(alice)).toBe(false);
		expect(controller.confirmEmptyFollowList()).toBe(false);
		expect(attempts).toHaveLength(0);
		await controller.reload();
		expect(controller.status).toBe('ready');
		expect(controller.loadError).toBeNull();
		controller.follow(alice);
		await succeed(0);
	});

	test('ignores a stale initial fetch after switching accounts', async () => {
		const fetched = Promise.withResolvers<Nostr.Event<typeof Contacts> | undefined>();
		const started = Promise.withResolvers<void>();
		vi.mocked(getLatestFollowList).mockImplementation((pubkey) => {
			if (pubkey === owner) {
				started.resolve();
				return fetched.promise;
			}
			return Promise.resolve(event(pubkey));
		});
		const { controller } = harness();
		const first = controller.setAccount(account);
		await started.promise;
		await controller.setAccount(otherAccount);
		fetched.resolve(event(owner, { kind: Contacts, tags: [['p', alice]], content: 'old' }));
		await first;
		expect(controller.pubkey).toBe(otherOwner);
		expect(controller.event?.pubkey).toBe(otherOwner);
		expect(controller.isFollowing(alice)).toBe(false);
	});

	test('isolates late publish results and captures the matching account and signer', async () => {
		const { controller, attempts, succeed } = harness();
		await controller.setAccount(account);
		controller.follow(alice);
		await controller.setAccount(otherAccount);
		expect(controller.isFollowing(alice)).toBe(false);
		expect(controller.publishError).toBeNull();
		expect(controller.lastCreatedAt).toBeUndefined();
		controller.follow(carol);
		expect(attempts[0].pubkey).toBe(owner);
		expect(attempts[0].signer).toBe(signer);
		expect(attempts[1].pubkey).toBe(otherOwner);
		expect(attempts[1].signer).toBe(otherSigner);
		await succeed(0, { status: 'failed', error: new Error('Old cache error') });
		expect(controller.isPublishing).toBe(true);
		expect(controller.isFollowing(carol)).toBe(true);
		expect(controller.isFollowing(alice)).toBe(false);
		expect(controller.cacheError).toBeNull();
		expect(controller.lastCreatedAt).toBeUndefined();
		await succeed(1);
		expect(controller.event?.pubkey).toBe(otherOwner);
	});

	test('waits for an old publish when returning to the account and keeps its timestamp and successful basis', async () => {
		const { controller, attempts, succeed } = harness();
		await controller.setAccount(account);
		controller.follow(alice);
		controller.follow(bob);
		await controller.setAccount(otherAccount);
		const freshSigner: EventSigner = { getPublicKey: vi.fn(), signEvent: vi.fn() };
		const returning = controller.setAccount({ pubkey: owner, signer: freshSigner });
		expect(controller.status).toBe('loading');
		expect(controller.isPublishing).toBe(true);
		expect(controller.follow(carol)).toBe(false);
		expect(attempts).toHaveLength(1);
		await succeed(0, { status: 'failed', error: new Error('Not cached') }, 500);
		await returning;
		expect(controller.status).toBe('ready');
		expect(controller.isFollowing(alice)).toBe(true);
		expect(controller.isFollowing(bob)).toBe(false);
		expect(controller.cacheError).toBeNull();
		expect(controller.lastCreatedAt).toBe(500);
		controller.follow(carol);
		expect(attempts).toHaveLength(2);
		expect(attempts[1].previous).toBe(500);
		expect(attempts[1].signer).toBe(freshSigner);
		await succeed(1, { status: 'updated' }, 501);
	});
});
