import { tick } from 'svelte';
import { Repost, ShortTextNote } from 'nostr-tools/kinds';
import type { ColumnConfig, Post, ThreadPost } from './types';
import {
	addProfilePostEvent,
	addProfileReferencedEvent,
	markProfileReferencedEventUnavailable
} from './profile-post-runtime';
import {
	emptyTimelineRuntime,
	getTimelineRequest,
	timelineRuntimeToPosts,
	type TimelineRuntime
} from './timeline-runtime';
import type { ProfilePointer } from '$lib/nostr/nip19';
import type { Profile } from '$lib/nostr/profiles';
import { eventToPost, getThreadReference } from '$lib/nostr/posts';
import {
	combineRelays,
	defaultRelays,
	profileRelays,
	resolveRelaySelection
} from '$lib/nostr/relays';
import { buildThreadEvents, startThreadSubscription } from '$lib/nostr/thread';
import { startCustomTimelineSubscription } from '$lib/nostr/timeline';
import type * as Nostr from 'nostr-typedef';

export type DetailColumn =
	| { type: 'thread'; sourceColumnId: string; eventId: string }
	| { type: 'profile'; sourceColumnId: string; pubkey: string };

type Stoppable = { stop: () => void };

type DetailColumnControllerOptions = {
	getColumnConfigs: () => ColumnConfig[];
	getProfile: (pubkey: string) => Profile | undefined;
	isMutedUser: (pubkey: string) => boolean;
	requestProfiles: (pubkeys: string[], relays: string[]) => void;
	focusColumn: (columnId: string, preferPost?: boolean) => void;
	startThread?: typeof startThreadSubscription;
	startProfileTimeline?: typeof startCustomTimelineSubscription;
	afterStateChange?: () => Promise<void>;
};

export function createDetailColumnController({
	getColumnConfigs,
	getProfile,
	isMutedUser,
	requestProfiles,
	focusColumn,
	startThread = startThreadSubscription,
	startProfileTimeline = startCustomTimelineSubscription,
	afterStateChange = tick
}: DetailColumnControllerOptions) {
	const defaultProfileRelays = [...profileRelays];
	let detailColumn = $state<DetailColumn | null>(null);
	let threadSelectedEvent = $state<Nostr.Event | null>(null);
	let threadEvents = $state<Nostr.Event[]>([]);
	let isThreadLoading = $state(false);
	let threadError = $state<string | null>(null);
	let threadSubscription: Stoppable | null = null;
	let threadRequestId = 0;
	let profilePostRuntimes = $state<Record<string, TimelineRuntime>>({});
	let profilePostSubscription: Stoppable | null = null;
	let profilePostRequestId = 0;

	const threadPosts = $derived<ThreadPost[]>(
		threadSelectedEvent
			? buildThreadEvents(
					threadEvents,
					getThreadReference(threadSelectedEvent)?.rootId ?? threadSelectedEvent.id
				).map(({ event, depth }) => ({
					post: eventToPost(event, getProfile(event.pubkey)),
					depth,
					isMuted: isMutedUser(event.pubkey)
				}))
			: []
	);
	const profilePosts = $derived(
		detailColumn?.type === 'profile'
			? timelineRuntimeToPosts(
					profilePostRuntimes[detailColumn.pubkey] ?? emptyTimelineRuntime(),
					getProfile
				)
			: []
	);
	const profileRuntime = $derived(
		detailColumn?.type === 'profile'
			? (profilePostRuntimes[detailColumn.pubkey] ?? emptyTimelineRuntime())
			: emptyTimelineRuntime()
	);

	function getSourceRelays(sourceColumnId: string) {
		const sourceColumn = getColumnConfigs().find((column) => column.id === sourceColumnId);
		const request = sourceColumn ? getTimelineRequest(sourceColumn) : null;
		return request ? resolveRelaySelection(request.relays) : [];
	}

	function stopThread() {
		threadRequestId += 1;
		threadSubscription?.stop();
		threadSubscription = null;
		threadSelectedEvent = null;
		threadEvents = [];
		threadError = null;
		isThreadLoading = false;
	}

	function stopProfile() {
		profilePostRequestId += 1;
		profilePostSubscription?.stop();
		profilePostSubscription = null;
	}

	function setProfilePostRuntime(pubkey: string, runtime: TimelineRuntime) {
		profilePostRuntimes = { ...profilePostRuntimes, [pubkey]: runtime };
	}

	function startProfilePostSubscription(pubkey: string, relays: string[]) {
		stopProfile();
		const requestId = profilePostRequestId;
		const currentRuntime = profilePostRuntimes[pubkey] ?? emptyTimelineRuntime(pubkey);
		setProfilePostRuntime(pubkey, { ...currentRuntime, isLoading: true, error: null });

		profilePostSubscription = startProfileTimeline({
			filters: [{ kinds: [ShortTextNote, Repost], authors: [pubkey], limit: 20 }],
			relays: { type: 'custom', urls: relays },
			onEvent: (event) => {
				if (profilePostRequestId !== requestId) return;
				const runtime = profilePostRuntimes[pubkey] ?? emptyTimelineRuntime(pubkey);
				setProfilePostRuntime(pubkey, addProfilePostEvent(runtime, event));
			},
			onReferencedEvent: (referenceEventId, event) => {
				if (profilePostRequestId !== requestId) return;
				const runtime = profilePostRuntimes[pubkey] ?? emptyTimelineRuntime(pubkey);
				setProfilePostRuntime(pubkey, addProfileReferencedEvent(runtime, referenceEventId, event));
			},
			onReferencedEventUnavailable: (referenceEventId) => {
				if (profilePostRequestId !== requestId) return;
				const runtime = profilePostRuntimes[pubkey] ?? emptyTimelineRuntime(pubkey);
				setProfilePostRuntime(
					pubkey,
					markProfileReferencedEventUnavailable(runtime, referenceEventId)
				);
			},
			onLoadingChange: (isLoading) => {
				if (profilePostRequestId !== requestId) return;
				const runtime = profilePostRuntimes[pubkey] ?? emptyTimelineRuntime(pubkey);
				setProfilePostRuntime(pubkey, { ...runtime, isLoading });
			},
			onError: (error) => {
				if (profilePostRequestId !== requestId) return;
				const runtime = profilePostRuntimes[pubkey] ?? emptyTimelineRuntime(pubkey);
				setProfilePostRuntime(pubkey, { ...runtime, error, isLoading: false });
			}
		});
	}

	async function openThread(sourceColumnId: string, post: Post) {
		if (!post.thread) return;
		if (detailColumn?.type === 'thread' && detailColumn.eventId === post.thread.event.id) {
			await close();
			return;
		}

		stopThread();
		stopProfile();
		const requestId = threadRequestId;
		detailColumn = { type: 'thread', sourceColumnId, eventId: post.thread.event.id };
		threadSelectedEvent = post.thread.event;
		threadEvents = [post.thread.event];
		threadError = null;
		isThreadLoading = true;

		threadSubscription = startThread({
			selectedEvent: post.thread.event,
			relays: getSourceRelays(sourceColumnId),
			onEvents: (events) => {
				if (threadRequestId !== requestId) return;
				threadEvents = events;
			},
			onLoadingChange: (isLoading) => {
				if (threadRequestId !== requestId) return;
				isThreadLoading = isLoading;
			},
			onError: (message) => {
				if (threadRequestId !== requestId) return;
				threadError = message;
				isThreadLoading = false;
			}
		});

		await afterStateChange();
		focusColumn('thread', true);
	}

	async function openProfile(sourceColumnId: string, profile: ProfilePointer) {
		if (detailColumn?.type === 'profile' && detailColumn.pubkey === profile.pubkey) {
			await close();
			return;
		}

		stopThread();
		const relays = combineRelays(
			getSourceRelays(sourceColumnId),
			profile.relays,
			[...defaultRelays],
			defaultProfileRelays
		);
		requestProfiles([profile.pubkey], relays);
		detailColumn = { type: 'profile', sourceColumnId, pubkey: profile.pubkey };
		startProfilePostSubscription(profile.pubkey, relays);

		await afterStateChange();
		focusColumn('profile', true);
	}

	async function close({ restoreFocus = true }: { restoreFocus?: boolean } = {}) {
		const sourceColumnId = detailColumn?.sourceColumnId;
		stopThread();
		stopProfile();
		detailColumn = null;

		if (
			restoreFocus &&
			sourceColumnId &&
			getColumnConfigs().some(({ id }) => id === sourceColumnId)
		) {
			await afterStateChange();
			focusColumn(sourceColumnId, true);
		}
	}

	function stop() {
		stopThread();
		stopProfile();
		detailColumn = null;
	}

	return {
		get detailColumn() {
			return detailColumn;
		},
		get threadPosts() {
			return threadPosts;
		},
		get isThreadLoading() {
			return isThreadLoading;
		},
		get threadError() {
			return threadError;
		},
		get profilePosts() {
			return profilePosts;
		},
		get profileRuntime() {
			return profileRuntime;
		},
		openThread,
		openProfile,
		close,
		stop
	};
}
