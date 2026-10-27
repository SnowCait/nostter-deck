import { shouldReplaceCurrentEvent } from '@nostter/nostr-protocol';
import type * as Nostr from 'nostr-typedef';
import { Contacts } from 'nostr-tools/kinds';
import type { EventSigner } from 'rx-nostr';
import { addFollow, removeFollow, type FollowListUpdate } from '../domain/follow-actions';
import { getLatestFollowList } from './follow-list';
import { publishAndCacheFollowList } from './publish-and-cache-follow-list';
import { getCachedLatestEvent } from '$lib/nostr/latest-event-cache';
import type { PublishPostResult } from '$lib/nostr/relay/publish-event';

type Account = { pubkey: string; signer: EventSigner };
type LoadStatus = 'loading' | 'ready' | 'unknown' | 'failed';
type PublishError =
	| { type: 'publish'; result: Extract<PublishPostResult, { ok: false }> }
	| { type: 'conflict'; error?: unknown }
	| { type: 'exception'; error: unknown };

type Session = {
	pubkey: string;
	status: LoadStatus;
	event: Nostr.Event<typeof Contacts> | undefined;
	desired: FollowListUpdate | undefined;
	isPublishing: boolean;
	loadError: unknown;
	publishError: PublishError | null;
	cacheError: unknown;
	lastCreatedAt: number | undefined;
	revision: number;
	intents: Record<string, boolean>;
	needsPublish: boolean;
	paused: boolean;
	loading?: Promise<void>;
};

type AccountWork = {
	pending?: Promise<void>;
	lastCreatedAt?: number;
	published?: Nostr.Event<typeof Contacts>;
};

function toUpdate(event: Nostr.Event<typeof Contacts>): FollowListUpdate {
	return { kind: Contacts, tags: event.tags, content: event.content };
}

function sameList(desired: FollowListUpdate, event: FollowListUpdate | undefined) {
	return (
		desired.content === (event?.content ?? '') &&
		JSON.stringify(desired.tags) === JSON.stringify(event?.tags ?? [])
	);
}

export function createFollowListController() {
	let active = $state<Session | null>(null);
	let selectedAccount: Account | null = null;
	// Bookkeeping survives view changes; it is not rendered state.
	// eslint-disable-next-line svelte/prefer-svelte-reactivity
	const accounts = new Map<string, AccountWork>();

	function accountWork(pubkey: string) {
		let work = accounts.get(pubkey);
		if (!work) {
			work = {};
			accounts.set(pubkey, work);
		}
		return work;
	}

	async function load(state: Session, work: AccountWork) {
		try {
			await work.pending;
			if (active !== state) {
				return;
			}
			state.isPublishing = false;
			state.lastCreatedAt = work.lastCreatedAt;
			const fetched = await getLatestFollowList(state.pubkey);
			if (active !== state) {
				return;
			}
			// A successful publish remains a valid basis even if its cache write failed.
			const event =
				work.published && shouldReplaceCurrentEvent(work.published, fetched)
					? work.published
					: fetched;
			state.event = event;
			state.desired = event ? toUpdate(event) : undefined;
			state.status = event ? 'ready' : 'unknown';
		} catch (error) {
			if (active !== state) {
				return;
			}
			state.loadError = error;
			state.status = 'failed';
		} finally {
			if (active === state) {
				state.loading = undefined;
			}
		}
	}

	function setAccount(account: Account | null): Promise<void> {
		selectedAccount = account;
		if (account && active?.pubkey === account.pubkey) {
			return active.loading ?? Promise.resolve();
		}
		active = account
			? {
					pubkey: account.pubkey,
					status: 'loading',
					event: undefined,
					desired: undefined,
					isPublishing: Boolean(accountWork(account.pubkey).pending),
					loadError: null,
					publishError: null,
					cacheError: null,
					lastCreatedAt: accountWork(account.pubkey).lastCreatedAt,
					revision: 0,
					intents: {},
					needsPublish: false,
					paused: false
				}
			: null;
		if (!active) {
			return Promise.resolve();
		}
		const state = active;
		state.loading = load(state, accountWork(state.pubkey));
		return state.loading;
	}

	function reload(): Promise<void> {
		const state = active;
		if (!state || state.status === 'ready') {
			return Promise.resolve();
		}
		if (state.loading) {
			return state.loading;
		}
		state.status = 'loading';
		state.loadError = null;
		state.loading = load(state, accountWork(state.pubkey));
		return state.loading;
	}

	/** Call only after independently confirming absence; an undefined fetch is insufficient. */
	function confirmEmptyFollowList() {
		if (!active || active.status !== 'unknown') {
			return false;
		}
		active.desired = { kind: Contacts, tags: [], content: '' };
		active.status = 'ready';
		return true;
	}

	function pauseForConflict(state: Session, error?: unknown) {
		state.publishError = { type: 'conflict', ...(error === undefined ? {} : { error }) };
		state.needsPublish = true;
		state.paused = true;
	}

	async function readLatestBasis(state: Session, known: Nostr.Event<typeof Contacts> | undefined) {
		try {
			const cached = await getCachedLatestEvent([state.pubkey, Contacts, '']);
			if (cached) {
				return shouldReplaceCurrentEvent(cached, known) ? cached : known;
			}
			if (active === state) {
				pauseForConflict(state);
			}
		} catch (error) {
			if (active === state) {
				pauseForConflict(state, error);
			}
		}
	}

	function adoptBasis(state: Session, basis: Nostr.Event<typeof Contacts>, rebase: boolean) {
		state.event = basis;
		if (rebase) {
			let desired = toUpdate(basis);
			for (const [pubkey, following] of Object.entries(state.intents)) {
				desired =
					(following ? addFollow(desired, pubkey) : removeFollow(desired, pubkey)) ?? desired;
			}
			state.desired = desired;
		}
	}

	function startPublishing(state: Session) {
		if (active !== state || state.status !== 'ready' || !state.desired || state.isPublishing) {
			return false;
		}
		if (state.paused || (!state.needsPublish && sameList(state.desired, state.event))) {
			return false;
		}
		const work = accountWork(state.pubkey);
		if (work.pending) {
			return false;
		}
		const finished = Promise.withResolvers<void>();
		work.pending = finished.promise;
		state.isPublishing = true;
		const refreshBeforeRetry = state.publishError?.type === 'conflict';
		state.publishError = null;

		void (async () => {
			try {
				let rebased = false;
				if (refreshBeforeRetry) {
					const basis = await readLatestBasis(state, work.published ?? state.event);
					if (!basis) {
						return;
					}
					work.published = basis;
					if (active !== state) {
						return;
					}
					adoptBasis(state, basis, true);
					state.needsPublish = !sameList(state.desired!, basis);
					if (!state.needsPublish) {
						state.intents = {};
						return;
					}
				}
				while (active === state && state.desired && selectedAccount) {
					const update = $state.snapshot(state.desired);
					const revision = state.revision;
					const { pubkey, signer } = selectedAccount;
					const previousCreatedAt =
						work.lastCreatedAt === undefined
							? undefined
							: Math.max(work.lastCreatedAt, state.event?.created_at ?? 0);
					const result = await publishAndCacheFollowList(update, pubkey, signer, previousCreatedAt);
					work.lastCreatedAt = result.createdAt;
					if (result.publishResult.ok) {
						// An ignored event is not a safe fallback until its cache basis is checked.
						work.published =
							result.cacheResult.status === 'ignored'
								? undefined
								: (result.publishResult.event as Nostr.Event<typeof Contacts>);
					}
					if (active !== state) {
						return;
					}
					state.lastCreatedAt = result.createdAt;
					if (result.publishResult.ok) {
						state.publishError = null;
						state.cacheError =
							result.cacheResult.status === 'failed' ? result.cacheResult.error : null;
						const published = result.publishResult.event as Nostr.Event<typeof Contacts>;
						let basis = published;
						if (result.cacheResult.status === 'ignored') {
							const latest = await readLatestBasis(state, published);
							if (!latest) {
								return;
							}
							basis = latest;
							work.published = basis;
						}
						if (active !== state) {
							return;
						}
						const newer = shouldReplaceCurrentEvent(basis, published);
						adoptBasis(state, basis, newer);
						state.needsPublish = false;
						if (sameList(state.desired, state.event)) {
							state.intents = {};
							return;
						}
						if (newer) {
							if (rebased) {
								pauseForConflict(state);
								return;
							}
							rebased = true;
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
				if (active === state) {
					state.publishError = { type: 'exception', error };
					state.needsPublish = true;
					state.paused = true;
				}
			} finally {
				state.isPublishing = false;
				work.pending = undefined;
				finished.resolve();
			}
		})();
		return true;
	}

	function changeFollow(pubkey: string, following: boolean) {
		const state = active;
		if (!state || state.status !== 'ready' || !state.desired) {
			return false;
		}
		const update = following
			? addFollow(state.desired, pubkey)
			: removeFollow(state.desired, pubkey);
		if (!update) {
			return false;
		}
		state.desired = update;
		state.intents[pubkey] = following;
		state.revision += 1;
		startPublishing(state);
		return true;
	}

	function retry() {
		if (!active || active.isPublishing || !active.publishError) {
			return false;
		}
		active.paused = false;
		return startPublishing(active);
	}

	return {
		setAccount,
		reload,
		confirmEmptyFollowList,
		follow: (pubkey: string) => changeFollow(pubkey, true),
		unfollow: (pubkey: string) => changeFollow(pubkey, false),
		retry,
		isFollowing: (pubkey: string) =>
			active?.desired?.tags.some((tag) => tag[0] === 'p' && tag[1] === pubkey),
		get pubkey() {
			return active?.pubkey ?? null;
		},
		get status() {
			return active?.status ?? 'idle';
		},
		get event() {
			return $state.snapshot(active?.event);
		},
		get desired() {
			return $state.snapshot(active?.desired);
		},
		get isPublishing() {
			return active?.isPublishing ?? false;
		},
		get loadError() {
			return active?.loadError ?? null;
		},
		get publishError() {
			return active?.publishError ?? null;
		},
		get cacheError() {
			return active?.cacheError ?? null;
		},
		get lastCreatedAt() {
			return active?.lastCreatedAt;
		}
	};
}
