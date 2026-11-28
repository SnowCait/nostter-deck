import type { EventSigner } from 'rx-nostr';
import type { FollowListUpdate } from '../domain/follow-actions';
import {
	publishEvent,
	type PublishEventTemplate,
	type PublishPostResult
} from '$lib/nostr/relay/publish-event';
import { putCachedLatestEvent } from '$lib/nostr/latest-event-cache';

export async function publishFollowList(
	update: FollowListUpdate,
	pubkey: string,
	signer: EventSigner,
	createdAt: number
): Promise<PublishPostResult> {
	const eventTemplate: PublishEventTemplate = {
		kind: update.kind,
		tags: update.tags,
		content: update.content,
		created_at: createdAt
	};

	const result = await publishEvent(eventTemplate, pubkey, signer);
	if (result.ok) {
		try {
			await putCachedLatestEvent(result.event);
		} catch {
			// A cache write failure does not undo a successful publication.
		}
	}
	return result;
}
