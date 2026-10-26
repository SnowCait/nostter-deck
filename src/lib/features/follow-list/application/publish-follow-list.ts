import type { EventSigner } from 'rx-nostr';
import type { FollowListUpdate } from '../domain/follow-actions';
import {
	publishEvent,
	type PublishEventTemplate,
	type PublishPostResult
} from '$lib/nostr/relay/publish-event';

export function publishFollowList(
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

	return publishEvent(eventTemplate, pubkey, signer);
}
