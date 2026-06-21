import { ChannelMessage, ShortTextNote } from 'nostr-tools/kinds';
import { now } from 'rx-nostr';
import { catchError, defaultIfEmpty, filter, firstValueFrom, map, of, take } from 'rxjs';
import type * as Nostr from 'nostr-typedef';
import { getNostrClient } from './client';
import type { Nip07Signer } from './auth.svelte';

export type PublishPostResult =
	| { ok: true; event: Nostr.Event }
	| { ok: false; reason: 'signing-failed' | 'account-mismatch' | 'relay-failed' };

type PublishEventTemplate = Pick<Nostr.Event, 'kind' | 'tags' | 'content' | 'created_at'>;

async function publishEvent(
	eventTemplate: PublishEventTemplate,
	pubkey: string,
	signer: Nip07Signer,
	relays?: string[]
): Promise<PublishPostResult> {
	let signedEvent: Nostr.Event;
	try {
		signedEvent = await signer.signEvent(eventTemplate);
	} catch {
		return { ok: false, reason: 'signing-failed' };
	}

	if (signedEvent.pubkey.toLowerCase() !== pubkey.toLowerCase()) {
		return { ok: false, reason: 'account-mismatch' };
	}

	try {
		const accepted = await firstValueFrom(
			getNostrClient()
				.send(signedEvent, {
					completeOn: 'all-ok',
					errorOnTimeout: true,
					...(relays ? { on: { defaultWriteRelays: true, relays } } : {})
				})
				.pipe(
					filter((packet) => packet.ok),
					take(1),
					map(() => true),
					defaultIfEmpty(false),
					catchError(() => of(false))
				)
		);
		if (!accepted) return { ok: false, reason: 'relay-failed' };
		return { ok: true, event: signedEvent };
	} catch {
		return { ok: false, reason: 'relay-failed' };
	}
}

export function publishShortTextNote(content: string, pubkey: string, signer: Nip07Signer) {
	return publishEvent(
		{
			kind: ShortTextNote,
			tags: [],
			content,
			created_at: now()
		},
		pubkey,
		signer
	);
}

export function publishChannelMessage(
	content: string,
	channelId: string,
	pubkey: string,
	signer: Nip07Signer,
	channelRelays: string[]
) {
	return publishEvent(
		{
			kind: ChannelMessage,
			tags: [['e', channelId, '', 'root']],
			content,
			created_at: now()
		},
		pubkey,
		signer,
		channelRelays
	);
}
