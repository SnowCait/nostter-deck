import { getRepostedEvent } from 'nostr-tools/nip18';
import type * as Nostr from 'nostr-typedef';

export function getVerifiedEmbeddedRepostedEvent(repostEvent: Nostr.Event): Nostr.Event | null {
	return getRepostedEvent(repostEvent) ?? null;
}
