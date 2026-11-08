import type * as Nostr from 'nostr-typedef';
import { Contacts } from 'nostr-tools/kinds';
import type { EventSigner } from 'rx-nostr';
import { addFollow, removeFollow, type FollowListUpdate } from '../domain/follow-actions';
import { getLatestFollowList } from './follow-list';
import { publishAndCacheFollowList } from './publish-and-cache-follow-list';
import { getCachedLatestEvent } from '$lib/nostr/latest-event-cache';
import type { PublishPostResult } from '$lib/nostr/relay/publish-event';

type Account = { pubkey: string; signer: EventSigner };
type LoadStatus = 'loading' | 'ready' | 'failed';
type PublishError =
	| { type: 'publish'; result: Extract<PublishPostResult, { ok: false }> }
	| { type: 'conflict'; error?: unknown }
	| { type: 'exception'; error: unknown };

type State = {
	status: LoadStatus;
	event: Nostr.Event<typeof Contacts> | undefined;
	desired: FollowListUpdate | undefined;
	isPublishing: boolean;
	loadError: unknown;
	publishError: PublishError | null;
	cacheError: unknown;
	lastCreatedAt: number | undefined;
	revision: number;
	needsPublish: boolean;
	paused: boolean;
	loading?: Promise<void>;
};

function sameList(desired: FollowListUpdate, event: FollowListUpdate | undefined) {
	return (
		desired.content === (event?.content ?? '') &&
		JSON.stringify(desired.tags) === JSON.stringify(event?.tags ?? [])
	);
}

/**
 * Owns one account and its signer for its entire lifetime.
 * Call dispose before changing authentication. It stops new work, but cannot cancel
 * signing or relay requests already started; await it before replacing this controller
 * for the same pubkey. A disposed controller cannot be reused.
 */
export function createFollowListController({ pubkey, signer }: Account) {
	const state = $state<State>({
		status: 'loading',
		event: undefined,
		desired: undefined,
		isPublishing: false,
		loadError: null,
		publishError: null,
		cacheError: null,
		lastCreatedAt: undefined,
		revision: 0,
		needsPublish: false,
		paused: false
	});
	let disposed = false;
	let pending: Promise<void> | undefined;

	async function load() {
		const recoveringConflict = state.publishError?.type === 'conflict';
		try {
			await pending;
			if (disposed) {
				return;
			}
			state.isPublishing = false;
			const event = await getLatestFollowList(pubkey);
			if (disposed) {
				return;
			}
			state.event = event;
			state.desired = event;
			state.status = 'ready';
			if (recoveringConflict && event) {
				state.publishError = null;
				state.needsPublish = false;
				state.paused = false;
			}
		} catch (error) {
			if (disposed) {
				return;
			}
			state.loadError = error;
			state.status = 'failed';
		} finally {
			if (!disposed) {
				state.loading = undefined;
			}
		}
	}

	function reload(): Promise<void> {
		if (disposed || (state.status === 'ready' && state.publishError?.type !== 'conflict')) {
			return Promise.resolve();
		}
		if (state.loading) {
			return state.loading;
		}
		state.status = 'loading';
		state.loadError = null;
		state.loading = load();
		return state.loading;
	}

	function pauseForConflict(error?: unknown) {
		state.publishError = { type: 'conflict', ...(error === undefined ? {} : { error }) };
		state.needsPublish = true;
		state.paused = true;
	}

	function startPublishing() {
		if (disposed || state.status !== 'ready' || !state.desired || state.isPublishing) {
			return false;
		}
		if (state.paused || (!state.needsPublish && sameList(state.desired, state.event))) {
			return false;
		}
		const finished = Promise.withResolvers<void>();
		pending = finished.promise;
		state.isPublishing = true;
		state.publishError = null;

		void (async () => {
			try {
				while (!disposed && state.desired) {
					const update = $state.snapshot(state.desired);
					const revision = state.revision;
					const previousCreatedAt =
						state.lastCreatedAt === undefined
							? undefined
							: Math.max(state.lastCreatedAt, state.event?.created_at ?? 0);
					const result = await publishAndCacheFollowList(update, pubkey, signer, previousCreatedAt);
					state.lastCreatedAt = result.createdAt;
					if (result.publishResult.ok) {
						state.publishError = null;
						state.cacheError =
							result.cacheResult.status === 'failed' ? result.cacheResult.error : null;
						const published = result.publishResult.event as Nostr.Event<typeof Contacts>;
						if (result.cacheResult.status === 'ignored') {
							let cached: Nostr.Event<typeof Contacts> | undefined;
							try {
								cached = await getCachedLatestEvent([pubkey, Contacts, '']);
							} catch (error) {
								if (!disposed) {
									pauseForConflict(error);
								}
								return;
							}
							if (disposed) {
								return;
							}
							if (!cached || cached.id !== published.id) {
								pauseForConflict();
								return;
							}
						}
						state.event = published;
						state.needsPublish = false;
						if (sameList(state.desired, state.event)) {
							return;
						}
					} else {
						state.publishError = { type: 'publish', result: result.publishResult };
						state.needsPublish = true;
						state.paused = result.publishResult.stage !== 'publishing';
						// Even a reverted desire must supersede a possibly delivered failed attempt.
						if (state.paused || state.revision === revision) {
							return;
						}
					}
				}
			} catch (error) {
				if (!disposed) {
					state.publishError = { type: 'exception', error };
					state.needsPublish = true;
					state.paused = true;
				}
			} finally {
				state.isPublishing = false;
				pending = undefined;
				finished.resolve();
			}
		})();
		return true;
	}

	function changeFollow(pubkey: string, following: boolean) {
		if (disposed || state.status !== 'ready' || state.publishError?.type === 'conflict') {
			return false;
		}
		const update = following
			? addFollow(state.desired, pubkey)
			: removeFollow(state.desired, pubkey);
		if (!update) {
			return false;
		}
		state.desired = update;
		state.revision += 1;
		startPublishing();
		return true;
	}

	function retry() {
		if (
			disposed ||
			state.isPublishing ||
			!state.publishError ||
			state.publishError.type === 'conflict'
		) {
			return false;
		}
		state.paused = false;
		return startPublishing();
	}

	state.loading = load();

	return {
		dispose() {
			disposed = true;
			return Promise.all([pending, state.loading]).then(() => {});
		},
		reload,
		follow: (pubkey: string) => changeFollow(pubkey, true),
		unfollow: (pubkey: string) => changeFollow(pubkey, false),
		retry,
		isFollowing: (pubkey: string): boolean =>
			state.desired?.tags.some((tag) => tag[0] === 'p' && tag[1] === pubkey) ?? false,
		get pubkey() {
			return pubkey;
		},
		get status() {
			return state.status;
		},
		get event() {
			return $state.snapshot(state.event);
		},
		get desired() {
			return $state.snapshot(state.desired);
		},
		get isPublishing() {
			return state.isPublishing;
		},
		get loadError() {
			return state.loadError ?? null;
		},
		get publishError() {
			return state.publishError;
		},
		get cacheError() {
			return state.cacheError ?? null;
		},
		get lastCreatedAt() {
			return state.lastCreatedAt;
		}
	};
}
