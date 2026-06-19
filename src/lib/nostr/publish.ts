import { ShortTextNote } from 'nostr-tools/kinds';
import { catchError, defaultIfEmpty, filter, firstValueFrom, map, of, take } from 'rxjs';
import type * as Nostr from 'nostr-typedef';
import { getNostrClient } from './client';
import type { Nip07Signer } from './auth.svelte';

export type PublishPostResult =
	| { ok: true; event: Nostr.Event }
	| { ok: false; reason: 'signing-failed' | 'account-mismatch' | 'relay-failed' };

export async function publishShortTextNote(
	content: string,
	pubkey: string,
	signer: Nip07Signer
): Promise<PublishPostResult> {
	const eventTemplate = {
		kind: ShortTextNote,
		tags: [],
		content,
		created_at: Math.floor(Date.now() / 1000)
	};

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
					errorOnTimeout: true
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
