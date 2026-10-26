import { now, type EventSigner } from 'rx-nostr';
import type { FollowListUpdate } from '../domain/follow-actions';
import { publishFollowList } from './publish-follow-list';
import {
	getCachedLatestEvent,
	putCachedLatestEvent,
	type PutCachedLatestEventStatus
} from '$lib/nostr/latest-event-cache';
import type { PublishPostResult } from '$lib/nostr/relay/publish-event';

export type PublishAndCacheFollowListResult = {
	publishResult: PublishPostResult;
	createdAt: number;
	cacheResult:
		| { status: PutCachedLatestEventStatus }
		| { status: 'failed'; error: unknown }
		| { status: 'not-attempted' };
};

export async function publishAndCacheFollowList(
	update: FollowListUpdate,
	pubkey: string,
	signer: EventSigner,
	previousAttemptCreatedAt?: number
): Promise<PublishAndCacheFollowListResult> {
	const cached = await getCachedLatestEvent([pubkey, update.kind, '']);
	let createdAt = now();
	if (cached) {
		createdAt = Math.max(createdAt, cached.created_at + 1);
	}
	if (previousAttemptCreatedAt !== undefined) {
		createdAt = Math.max(createdAt, previousAttemptCreatedAt + 1);
	}

	const publishResult = await publishFollowList(update, pubkey, signer, createdAt);
	if (!publishResult.ok) {
		return { publishResult, createdAt, cacheResult: { status: 'not-attempted' } };
	}

	try {
		const status = await putCachedLatestEvent(publishResult.event);
		return { publishResult, createdAt, cacheResult: { status } };
	} catch (error) {
		return { publishResult, createdAt, cacheResult: { status: 'failed', error } };
	}
}
