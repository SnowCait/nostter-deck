import { verifier } from '@rx-nostr/crypto';
import {
	createRxNostr,
	now,
	type EventSigner,
	type IWebSocketConstructor,
	type RxNostr
} from 'rx-nostr';
import type * as Nostr from 'nostr-typedef';
import { getAuthSigner } from './auth.svelte';
import { disposeProfileCache } from './profiles';

declare global {
	var __NOSTTER_DECK_SKIP_NOSTR_VERIFY__: boolean | undefined;
	var __NOSTTER_DECK_WEBSOCKET_CTOR__: IWebSocketConstructor | undefined;
}

let nostrClient: RxNostr | null = null;

const activeAccountSigner: EventSigner = {
	async getPublicKey() {
		const signer = getAuthSigner();
		if (!signer) throw new Error('NIP-42 authentication requires an active account');
		return signer.getPublicKey();
	},
	async signEvent<K extends number>(params: Nostr.EventParameters<K>) {
		const signer = getAuthSigner();
		if (!signer) throw new Error('NIP-42 authentication requires an active account');
		return (await signer.signEvent({
			...params,
			tags: params.tags ?? [],
			content: params.content ?? '',
			created_at: params.created_at ?? now()
		})) as Nostr.Event<K>;
	}
};

export function getNostrClient() {
	if (!nostrClient) {
		nostrClient = createRxNostr({
			verifier,
			authenticator: { signer: activeAccountSigner },
			skipVerify: globalThis.__NOSTTER_DECK_SKIP_NOSTR_VERIFY__ === true,
			websocketCtor: globalThis.__NOSTTER_DECK_WEBSOCKET_CTOR__
		});
	}

	return nostrClient;
}

export function disposeNostrClient() {
	disposeProfileCache();
	nostrClient?.dispose();
	nostrClient = null;
}
