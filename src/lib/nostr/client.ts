import { verifier } from '@rx-nostr/crypto';
import { createRxNostr, type IWebSocketConstructor, type RxNostr } from 'rx-nostr';

declare global {
	var __NOSTTER_DECK_SKIP_NOSTR_VERIFY__: boolean | undefined;
	var __NOSTTER_DECK_WEBSOCKET_CTOR__: IWebSocketConstructor | undefined;
}

let nostrClient: RxNostr | null = null;

export function getNostrClient() {
	if (!nostrClient) {
		nostrClient = createRxNostr({
			verifier,
			skipVerify: globalThis.__NOSTTER_DECK_SKIP_NOSTR_VERIFY__ === true,
			skipFetchNip11: true,
			websocketCtor: globalThis.__NOSTTER_DECK_WEBSOCKET_CTOR__
		});
	}

	return nostrClient;
}

export function disposeNostrClient() {
	nostrClient?.dispose();
	nostrClient = null;
}
