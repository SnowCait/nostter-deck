import type * as Nostr from 'nostr-typedef';
import { Contacts } from 'nostr-tools/kinds';
import { now, type EventSigner } from 'rx-nostr';
import { addFollow, removeFollow, type FollowListUpdate } from '../domain/follow-actions';
import { getLatestFollowList } from './follow-list';
import { publishFollowList } from './publish-follow-list';
import type { PublishPostResult } from '$lib/nostr/relay/publish-event';

type Account = { pubkey: string; signer: EventSigner };
type LoadStatus = 'loading' | 'ready' | 'failed';
type PublishError =
	| { type: 'publish'; result: Extract<PublishPostResult, { ok: false }> }
	| { type: 'exception'; error: unknown };

type State = {
	status: LoadStatus;
	event: Nostr.Event<typeof Contacts> | undefined;
	desired: FollowListUpdate | undefined;
	loadError: unknown;
	publishError: PublishError | null;
};

function sameList(desired: FollowListUpdate, event: FollowListUpdate) {
	return (
		desired.content === event.content && JSON.stringify(desired.tags) === JSON.stringify(event.tags)
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
		loadError: null,
		publishError: null
	});
	let disposed = false;
	let lastAttemptCreatedAt: number | undefined;
	let loading: Promise<void> | undefined;
	let pending = $state<Promise<void> | undefined>();

	async function load() {
		try {
			const event = await getLatestFollowList(pubkey);
			if (disposed) {
				return;
			}
			state.event = event;
			state.desired = event;
			state.status = 'ready';
		} catch (error) {
			if (disposed) {
				return;
			}
			state.loadError = error;
			state.status = 'failed';
		} finally {
			loading = undefined;
		}
	}

	function reload(): Promise<void> {
		if (disposed || state.status === 'ready') {
			return Promise.resolve();
		}
		if (loading) {
			return loading;
		}
		state.status = 'loading';
		state.loadError = null;
		loading = load();
		return loading;
	}

	function startPublishing(): boolean {
		if (disposed || pending !== undefined) {
			return false;
		}
		const finished = Promise.withResolvers<void>();
		pending = finished.promise;
		state.publishError = null;

		void (async () => {
			try {
				while (!disposed && state.desired) {
					const update = $state.snapshot(state.desired);
					let createdAt = now();
					if (state.event) {
						createdAt = Math.max(createdAt, state.event.created_at + 1);
					}
					if (lastAttemptCreatedAt !== undefined) {
						createdAt = Math.max(createdAt, lastAttemptCreatedAt + 1);
					}
					lastAttemptCreatedAt = createdAt;
					const result = await publishFollowList(update, pubkey, signer, createdAt);
					if (!result.ok) {
						state.publishError = { type: 'publish', result };
						return;
					}
					state.event = result.event as Nostr.Event<typeof Contacts>;
					if (sameList(state.desired, state.event)) {
						return;
					}
				}
			} catch (error) {
				if (!disposed) {
					state.publishError = { type: 'exception', error };
				}
			} finally {
				pending = undefined;
				finished.resolve();
			}
		})();
		return true;
	}

	function changeFollow(pubkey: string, following: boolean) {
		if (disposed || state.status !== 'ready') {
			return false;
		}
		const update = following
			? addFollow(state.desired, pubkey)
			: removeFollow(state.desired, pubkey);
		if (!update) {
			return false;
		}
		state.desired = update;
		if (!state.publishError) {
			startPublishing();
		}
		return true;
	}

	function retry() {
		if (!state.publishError) {
			return false;
		}
		return startPublishing();
	}

	loading = load();

	return {
		dispose() {
			disposed = true;
			return Promise.all([pending, loading]).then(() => {});
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
			return pending !== undefined;
		},
		get loadError() {
			return state.loadError ?? null;
		},
		get publishError() {
			return state.publishError;
		}
	};
}
