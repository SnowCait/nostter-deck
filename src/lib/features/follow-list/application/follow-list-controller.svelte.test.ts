import type * as Nostr from 'nostr-typedef';
import { Contacts } from 'nostr-tools/kinds';
import type { EventSigner } from 'rx-nostr';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { FollowListUpdate } from '../domain/follow-actions';
import { createFollowListController } from './follow-list-controller.svelte';
import { getLatestFollowList } from './follow-list';
import { publishFollowList } from './publish-follow-list';
import { putCachedLatestEvent } from '$lib/nostr/latest-event-cache';
import {
	publishEvent,
	type PublishEventTemplate,
	type PublishPostResult
} from '$lib/nostr/relay/publish-event';

vi.mock('./follow-list', () => ({ getLatestFollowList: vi.fn() }));
vi.mock('./publish-follow-list', { spy: true });
vi.mock('$lib/nostr/relay/publish-event', () => ({ publishEvent: vi.fn() }));
vi.mock('$lib/nostr/latest-event-cache', () => ({ putCachedLatestEvent: vi.fn() }));

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
		update: PublishEventTemplate;
		pubkey: string;
		signer: EventSigner;
		completion: ReturnType<typeof Promise.withResolvers<PublishPostResult>>;
	}[] = [];
	vi.mocked(publishEvent).mockImplementation((update, pubkey, signer) => {
		const completion = Promise.withResolvers<PublishPostResult>();
		attempts.push({ update, pubkey, signer, completion });
		return completion.promise;
	});
	const controller = createFollowListController(account);

	async function succeed(index: number) {
		const { update, pubkey, completion } = attempts[index];
		const published = event(pubkey, { ...update, kind: Contacts }, update.created_at);
		completion.resolve({ ok: true, event: published });
		await vi.mocked(publishFollowList).mock.results[index].value;
		return published;
	}

	async function fail(stage: 'signing' | 'publishing') {
		attempts[0].completion.resolve({
			ok: false,
			stage,
			reason: stage === 'signing' ? 'signing-failed' : 'relay-timeout',
			targetRelayCount: 2
		});
		await vi.mocked(publishFollowList).mock.results[0].value;
	}

	return { controller, attempts, succeed, fail };
}

beforeEach(() => {
	vi.resetAllMocks();
	vi.setSystemTime(100_000);
	vi.mocked(getLatestFollowList).mockImplementation(async (pubkey) => event(pubkey));
	vi.mocked(putCachedLatestEvent).mockResolvedValue('updated');
});

afterEach(() => {
	vi.useRealTimers();
});

describe('follow list controller', () => {
	test('reflects the first operation synchronously and starts publishing without debounce', async () => {
		vi.mocked(getLatestFollowList).mockResolvedValueOnce({ ...event(), created_at: 120 });
		const { controller, attempts, succeed } = harness();
		await controller.reload();
		expect(controller.follow(existing)).toBe(false);
		expect(controller.unfollow(alice)).toBe(false);
		expect(controller.follow(alice)).toBe(true);
		expect(controller.isFollowing(alice)).toBe(true);
		expect(controller.isPublishing).toBe(true);
		expect(attempts).toHaveLength(1);
		expect(attempts[0]).toMatchObject({ pubkey: owner });
		expect(attempts[0].signer).toBe(signer);
		expect(attempts[0].update).toEqual({
			kind: Contacts,
			tags: [...event().tags, ['p', alice, '']],
			content: event().content,
			created_at: 121
		});
		expect(controller.follow(alice)).toBe(false);
		const published = await succeed(0);
		expect(controller.isPublishing).toBe(false);
		expect(controller.event).toEqual(published);
		expect(attempts).toHaveLength(1);
	});

	test.each(['updated', 'ignored', 'rejected'] as const)(
		'coalesces operations and continues publishing when the cache write is %s',
		async (cacheResult) => {
			const { controller, attempts, succeed } = harness();
			if (cacheResult === 'rejected') {
				vi.mocked(putCachedLatestEvent).mockRejectedValueOnce(new Error('Cache unavailable'));
			} else {
				vi.mocked(putCachedLatestEvent).mockResolvedValueOnce(cacheResult);
			}
			await controller.reload();
			controller.follow(alice);
			controller.follow(bob);
			controller.unfollow(alice);
			expect(controller.isFollowing(alice)).toBe(false);
			expect(controller.isFollowing(bob)).toBe(true);
			expect(attempts).toHaveLength(1);
			expect(attempts[0].update.tags).toEqual([...event().tags, ['p', alice, '']]);
			expect(putCachedLatestEvent).not.toHaveBeenCalled();
			const published = await succeed(0);
			expect(putCachedLatestEvent).toHaveBeenCalledExactlyOnceWith(published);
			expect(controller.event).toEqual(published);
			expect(controller.publishError).toBeNull();
			expect(attempts).toHaveLength(2);
			expect(attempts[1].update.tags).toEqual([...event().tags, ['p', bob, '']]);
			expect(attempts[1].update.created_at).toBe(101);
			expect(controller.isPublishing).toBe(true);
			await succeed(1);
			expect(controller.isPublishing).toBe(false);
			expect(attempts).toHaveLength(2);
		}
	);

	test('skips another publish when intervening operations return to the sent state', async () => {
		const { controller, attempts, succeed } = harness();
		await controller.reload();
		controller.follow(alice);
		controller.follow(bob);
		controller.unfollow(bob);
		await succeed(0);
		expect(attempts).toHaveLength(1);
		expect(controller.desired).toMatchObject({
			kind: Contacts,
			tags: attempts[0].update.tags,
			content: attempts[0].update.content
		});
	});

	test.each(['signing', 'publishing'] as const)(
		'stops after %s failure and retries the latest desired state on request',
		async (stage) => {
			const { controller, attempts, fail, succeed } = harness();
			await controller.reload();
			controller.follow(alice);
			controller.follow(bob);
			await fail(stage);
			expect(putCachedLatestEvent).not.toHaveBeenCalled();
			expect(controller.isPublishing).toBe(false);
			expect(controller.publishError).toMatchObject({ type: 'publish', result: { stage } });
			expect(attempts).toHaveLength(1);
			controller.unfollow(alice);
			controller.follow(carol);
			expect(attempts).toHaveLength(1);
			expect(controller.isFollowing(alice)).toBe(false);
			expect(controller.isFollowing(bob)).toBe(true);
			expect(controller.isFollowing(carol)).toBe(true);
			expect(controller.retry()).toBe(true);
			expect(controller.retry()).toBe(false);
			expect(attempts[1].update.tags).toEqual([...event().tags, ['p', bob, ''], ['p', carol, '']]);
			expect(attempts[1].update.created_at).toBe(101);
			await succeed(1);
			expect(controller.publishError).toBeNull();
		}
	);

	test('retries a reverted desire after a relay failure', async () => {
		const { controller, attempts, fail, succeed } = harness();
		await controller.reload();
		controller.follow(alice);
		await fail('publishing');
		expect(controller.unfollow(alice)).toBe(true);
		expect(attempts).toHaveLength(1);
		expect(controller.desired?.tags).toEqual(event().tags);
		expect(controller.retry()).toBe(true);
		expect(attempts[1].update.tags).toEqual(event().tags);
		expect(attempts[1].update.created_at).toBe(101);
		await succeed(1);
		expect(controller.publishError).toBeNull();
	});

	test('recovers from a publishing API rejection without automatic retry', async () => {
		const { controller, attempts, succeed } = harness();
		const error = new Error('Publishing failed');
		await controller.reload();
		controller.follow(alice);
		controller.follow(bob);
		attempts[0].completion.reject(error);
		await vi.mocked(publishFollowList).mock.results[0].value.catch(() => {});
		expect(controller.isPublishing).toBe(false);
		expect(controller.publishError).toEqual({ type: 'exception', error });
		expect(controller.isFollowing(alice)).toBe(true);
		controller.follow(carol);
		expect(controller.isFollowing(carol)).toBe(true);
		expect(attempts).toHaveLength(1);
		expect(controller.retry()).toBe(true);
		expect(attempts[1].update).toEqual({
			kind: Contacts,
			content: event().content,
			tags: [...event().tags, ['p', alice, ''], ['p', bob, ''], ['p', carol, '']],
			created_at: 101
		});
		await succeed(1);
		expect(controller.isPublishing).toBe(false);
	});

	test('blocks loading operations and publishes the first follow after an empty load', async () => {
		const fetched = Promise.withResolvers<Nostr.Event<typeof Contacts> | undefined>();
		vi.mocked(getLatestFollowList).mockReturnValue(fetched.promise);
		const { controller, attempts, succeed } = harness();
		const loading = controller.reload();
		expect(controller.status).toBe('loading');
		expect(controller.follow(alice)).toBe(false);
		expect(controller.unfollow(alice)).toBe(false);
		fetched.resolve(undefined);
		await loading;
		expect(controller.status).toBe('ready');
		expect(controller.isFollowing(alice)).toBe(false);
		expect(controller.desired).toBeUndefined();
		expect(controller.unfollow(alice)).toBe(false);
		expect(controller.desired).toBeUndefined();
		expect(attempts).toHaveLength(0);
		expect(controller.follow(alice)).toBe(true);
		expect(controller.isPublishing).toBe(true);
		expect(attempts).toHaveLength(1);
		expect(attempts[0].update).toEqual({
			kind: Contacts,
			tags: [['p', alice, '']],
			content: '',
			created_at: 100
		});
		await succeed(0);
	});

	test('retains load errors without publishing and permits reloading', async () => {
		const error = new Error('Initial cache unavailable');
		vi.mocked(getLatestFollowList).mockRejectedValueOnce(error);
		const { controller, attempts, succeed } = harness();
		await controller.reload();
		expect(controller.status).toBe('failed');
		expect(controller.loadError).toBe(error);
		expect(controller.follow(alice)).toBe(false);
		expect(controller.unfollow(existing)).toBe(false);
		expect(attempts).toHaveLength(0);
		await controller.reload();
		expect(controller.status).toBe('ready');
		expect(controller.loadError).toBeNull();
		controller.follow(alice);
		await succeed(0);
	});

	test('disposal drains the captured account publish and stops queued operations', async () => {
		const { controller, attempts, succeed } = harness();
		await controller.reload();
		controller.follow(alice);
		controller.follow(bob);
		let drained = false;
		const draining = controller.dispose().then(() => {
			drained = true;
		});
		const replacement = createFollowListController(otherAccount);
		await replacement.reload();
		expect(drained).toBe(false);
		expect(controller.follow(carol)).toBe(false);
		expect(controller.retry()).toBe(false);
		expect(controller.isPublishing).toBe(true);
		expect(attempts[0].pubkey).toBe(owner);
		expect(attempts[0].signer).toBe(signer);
		await succeed(0);
		await draining;
		expect(controller.pubkey).toBe(owner);
		expect(controller.isPublishing).toBe(false);
		expect(attempts).toHaveLength(1);
		await replacement.dispose();
	});

	test('disposal ignores an outstanding load and prevents reuse', async () => {
		const fetched = Promise.withResolvers<Nostr.Event<typeof Contacts> | undefined>();
		vi.mocked(getLatestFollowList).mockReturnValue(fetched.promise);
		const { controller } = harness();
		expect(getLatestFollowList).toHaveBeenCalledTimes(1);
		let disposed = false;
		const draining = controller.dispose();
		void draining.then(() => (disposed = true));
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(disposed).toBe(false);
		fetched.resolve(event());
		await draining;
		expect(controller.event).toBeUndefined();
		expect(controller.desired).toBeUndefined();
		expect(controller.follow(alice)).toBe(false);
		expect(controller.retry()).toBe(false);
		await controller.reload();
		expect(getLatestFollowList).toHaveBeenCalledTimes(1);
	});
});
