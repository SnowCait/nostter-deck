import { describe, expect, test, vi } from 'vitest';
import { Repost, ShortTextNote } from 'nostr-tools/kinds';
import type * as Nostr from 'nostr-typedef';
import { createDetailColumnController } from './detail-column-controller.svelte';
import type { ColumnConfig } from './types';
import { eventToPost } from '$lib/nostr/posts';
import type { startThreadSubscription } from '$lib/nostr/thread';
import type { startCustomTimelineSubscription } from '$lib/nostr/timeline';

type ThreadSubscriptionOptions = Parameters<typeof startThreadSubscription>[0];
type ProfileSubscriptionOptions = Parameters<typeof startCustomTimelineSubscription>[0];

function event(
	id: string,
	createdAt: number,
	{
		pubkey = 'a'.repeat(64),
		kind = ShortTextNote,
		tags = [],
		content = id
	}: {
		pubkey?: string;
		kind?: number;
		tags?: string[][];
		content?: string;
	} = {}
) {
	return {
		id,
		pubkey,
		created_at: createdAt,
		kind,
		tags,
		content,
		sig: '0'.repeat(128)
	} satisfies Nostr.Event;
}

function createHarness() {
	let columns: ColumnConfig[] = [
		{
			id: 'source',
			type: 'timeline',
			timelineKind: 'custom',
			filters: [{ kinds: [ShortTextNote], limit: 20 }],
			relays: { type: 'custom', urls: ['wss://source.example/'] },
			width: 'standard'
		}
	];
	const threadSubscriptions: {
		options: ThreadSubscriptionOptions;
		stop: ReturnType<typeof vi.fn>;
	}[] = [];
	const profileSubscriptions: {
		options: ProfileSubscriptionOptions;
		stop: ReturnType<typeof vi.fn>;
	}[] = [];
	const focusColumn = vi.fn();
	const requestProfiles = vi.fn();
	const controller = createDetailColumnController({
		getColumnConfigs: () => columns,
		getProfile: () => undefined,
		isMutedUser: () => false,
		requestProfiles,
		focusColumn,
		startThread: (options) => {
			const stop = vi.fn();
			threadSubscriptions.push({ options, stop });
			return { stop };
		},
		startProfileTimeline: (options) => {
			const stop = vi.fn();
			profileSubscriptions.push({ options, stop });
			return { stop };
		},
		afterStateChange: async () => {}
	});

	return {
		controller,
		focusColumn,
		requestProfiles,
		threadSubscriptions,
		profileSubscriptions,
		removeSourceColumn() {
			columns = [];
		}
	};
}

describe('detail column controller', () => {
	test('opens and toggles a thread while restoring source focus', async () => {
		const harness = createHarness();
		const selectedEvent = event('1'.repeat(64), 100);
		const post = eventToPost(selectedEvent);

		await harness.controller.openThread('source', post);

		expect(harness.controller.detailColumn).toEqual({
			type: 'thread',
			sourceColumnId: 'source',
			eventId: selectedEvent.id
		});
		expect(harness.threadSubscriptions[0].options.relays).toEqual(['wss://source.example/']);
		expect(harness.controller.threadPosts.map(({ post }) => post.id)).toEqual([selectedEvent.id]);
		expect(harness.focusColumn).toHaveBeenLastCalledWith('thread', true);

		await harness.controller.openThread('source', post);

		expect(harness.threadSubscriptions[0].stop).toHaveBeenCalledOnce();
		expect(harness.controller.detailColumn).toBeNull();
		expect(harness.focusColumn).toHaveBeenLastCalledWith('source', true);
	});

	test('switches detail types and ignores callbacks from stopped subscriptions', async () => {
		const harness = createHarness();
		const selectedEvent = event('1'.repeat(64), 100);

		await harness.controller.openThread('source', eventToPost(selectedEvent));
		const staleThread = harness.threadSubscriptions[0];
		await harness.controller.openProfile('source', {
			pubkey: 'b'.repeat(64),
			relays: ['wss://profile.example/']
		});

		expect(staleThread.stop).toHaveBeenCalledOnce();
		expect(harness.controller.detailColumn).toEqual({
			type: 'profile',
			sourceColumnId: 'source',
			pubkey: 'b'.repeat(64)
		});
		staleThread.options.onError('stale thread error');
		staleThread.options.onEvents([event('2'.repeat(64), 200)]);
		expect(harness.controller.threadError).toBeNull();
		expect(harness.controller.threadPosts).toEqual([]);

		const staleProfile = harness.profileSubscriptions[0];
		await harness.controller.openThread('source', eventToPost(selectedEvent));
		expect(staleProfile.stop).toHaveBeenCalledOnce();
		staleProfile.options.onError('stale profile error');
		expect(harness.controller.detailColumn?.type).toBe('thread');
	});

	test('updates cached profile posts and clears active subscriptions on stop', async () => {
		const harness = createHarness();
		const pubkey = 'b'.repeat(64);
		await harness.controller.openProfile('source', { pubkey, relays: [] });
		const subscription = harness.profileSubscriptions[0];
		const profilePost = event('2'.repeat(64), 200, { pubkey, content: 'Profile post' });
		const repost = event('3'.repeat(64), 300, {
			pubkey,
			kind: Repost,
			tags: [['e', profilePost.id]]
		});

		subscription.options.onEvent(profilePost, { phase: 'initial' });
		subscription.options.onEvent(repost, { phase: 'initial' });
		subscription.options.onReferencedEvent(repost.id, profilePost);
		subscription.options.onLoadingChange(false);

		expect(harness.controller.profilePosts.map((post) => post.id)).toEqual([
			repost.id,
			profilePost.id
		]);
		expect(harness.controller.profileRuntime.isLoading).toBe(false);

		harness.controller.stop();
		expect(subscription.stop).toHaveBeenCalledOnce();
		expect(harness.controller.detailColumn).toBeNull();
	});

	test('does not restore focus when the source column no longer exists', async () => {
		const harness = createHarness();
		await harness.controller.openProfile('source', { pubkey: 'b'.repeat(64), relays: [] });
		harness.focusColumn.mockClear();
		harness.removeSourceColumn();

		await harness.controller.close();

		expect(harness.focusColumn).not.toHaveBeenCalled();
	});
});
