import type { Page } from '@playwright/test';

declare global {
	interface Window {
		__NOSTTER_DECK_SKIP_NOSTR_VERIFY__?: boolean;
		__NOSTTER_DECK_WEBSOCKET_CTOR__?: typeof WebSocket;
		__nostterFakeRelayConnections?: Record<string, number>;
		__nostterFakeRelayProfileRequests?: Record<string, number>;
		__nostterFakeRelayProfileAuthorRequests?: Record<string, number>;
		__nostterFakeRelayAddressRequests?: Record<string, number>;
		__nostterFakeRelaySearchRequests?: Record<string, number>;
		__nostterFakeRelayTimelineAuthorRequests?: Record<string, number>;
	}
}

export async function installFakeNostrRelay(page: Page) {
	await page.addInitScript(() => {
		const relayConnections: Record<string, number> = {};
		const relayProfileRequests: Record<string, number> = {};
		const relayProfileAuthorRequests: Record<string, number> = {};
		const relayAddressRequests: Record<string, number> = {};
		const relaySearchRequests: Record<string, number> = {};
		const relayTimelineAuthorRequests: Record<string, number> = {};
		const contactListAuthorPubkey =
			'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
		const addressableListAuthorPubkey =
			'dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd';
		const staleContactPubkey = 'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc';
		const profilePictureUrl = 'data:image/gif;base64,R0lGODlhAQABAAAAACwAAAAAAQABAAA=';
		const textEvent = {
			id: 'event-custom-timeline-1',
			pubkey: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
			created_at: Math.floor(Date.now() / 1000) - 90,
			kind: 1,
			tags: [['t', 'nostter']],
			content: 'Hello from a custom Nostr timeline',
			sig: '0'.repeat(128)
		};
		const staleTextEvent = {
			id: 'event-stale-custom-timeline-1',
			pubkey: staleContactPubkey,
			created_at: Math.floor(Date.now() / 1000) - 100,
			kind: 1,
			tags: [['t', 'nostter']],
			content: 'Hello from a stale contact list',
			sig: '0'.repeat(128)
		};
		const repostEvent = {
			id: 'event-custom-timeline-repost',
			pubkey: textEvent.pubkey,
			created_at: Math.floor(Date.now() / 1000) - 80,
			kind: 6,
			tags: [],
			content: 'Repost from a custom Nostr timeline',
			sig: '0'.repeat(128)
		};
		const editedSearchEvent = {
			id: 'event-search-edited',
			pubkey: textEvent.pubkey,
			created_at: Math.floor(Date.now() / 1000) - 70,
			kind: 1,
			tags: [['t', 'edited']],
			content: 'Edited search result from a Nostr search relay',
			sig: '0'.repeat(128)
		};
		const staleContactListEvent = {
			id: 'event-contact-list-stale',
			pubkey: contactListAuthorPubkey,
			created_at: Math.floor(Date.now() / 1000) - 240,
			kind: 3,
			tags: [['p', staleContactPubkey]],
			content: '',
			sig: '0'.repeat(128)
		};
		const contactListEvent = {
			id: 'event-contact-list',
			pubkey: contactListAuthorPubkey,
			created_at: Math.floor(Date.now() / 1000) - 180,
			kind: 3,
			tags: [['p', textEvent.pubkey]],
			content: '',
			sig: '0'.repeat(128)
		};
		const emptyAddressableListEvent = {
			id: 'event-addressable-list-empty',
			pubkey: addressableListAuthorPubkey,
			created_at: Math.floor(Date.now() / 1000) - 180,
			kind: 30000,
			tags: [
				['d', ''],
				['p', textEvent.pubkey]
			],
			content: '',
			sig: '0'.repeat(128)
		};
		const namedAddressableListEvent = {
			id: 'event-addressable-list-named',
			pubkey: addressableListAuthorPubkey,
			created_at: Math.floor(Date.now() / 1000) - 180,
			kind: 30000,
			tags: [
				['d', 'favorites'],
				['p', textEvent.pubkey]
			],
			content: '',
			sig: '0'.repeat(128)
		};
		const profileEvent = {
			id: 'event-profile-alice',
			pubkey: textEvent.pubkey,
			created_at: Math.floor(Date.now() / 1000) - 120,
			kind: 0,
			tags: [],
			content: JSON.stringify({
				display_name: 'Alice Relay',
				picture: profilePictureUrl
			}),
			sig: '0'.repeat(128)
		};
		const staleProfileEvent = {
			id: 'event-profile-alice-stale',
			pubkey: textEvent.pubkey,
			created_at: Math.floor(Date.now() / 1000) - 240,
			kind: 0,
			tags: [],
			content: JSON.stringify({
				display_name: 'Old Alice Relay',
				picture: 'https://example.com/old-alice.png'
			}),
			sig: '0'.repeat(128)
		};

		class FakeWebSocket {
			static CONNECTING = 0;
			static OPEN = 1;
			static CLOSING = 2;
			static CLOSED = 3;

			readyState = FakeWebSocket.CONNECTING;
			url: string;
			listeners: Record<string, Set<(event?: unknown) => void>> = {
				open: new Set(),
				message: new Set(),
				close: new Set()
			};

			constructor(url: string) {
				this.url = url;
				relayConnections[url] = (relayConnections[url] ?? 0) + 1;
				setTimeout(() => {
					this.readyState = FakeWebSocket.OPEN;
					this.dispatch('open');
				}, 0);
			}

			addEventListener(type: string, callback: (event?: unknown) => void) {
				this.listeners[type]?.add(callback);
			}

			removeEventListener(type: string, callback: (event?: unknown) => void) {
				this.listeners[type]?.delete(callback);
			}

			send(data: string) {
				const message = JSON.parse(data);
				if (!Array.isArray(message) || message[0] !== 'REQ') return;

				const subId = message[1] as string;
				const filters = message.slice(2) as Array<{
					kinds?: number[];
					authors?: string[];
					'#d'?: string[];
					search?: string;
				}>;
				const requestsTextEvents = filters.some(
					(filter) =>
						!filter.search &&
						(!filter.kinds || filter.kinds.includes(1)) &&
						(!filter.authors || filter.authors.includes(textEvent.pubkey))
				);
				for (const filter of filters) {
					if (filter.search || (filter.kinds && !filter.kinds.includes(1)) || !filter.authors) {
						continue;
					}
					const key = [...filter.authors].sort().join(',');
					relayTimelineAuthorRequests[key] = (relayTimelineAuthorRequests[key] ?? 0) + 1;
				}
				const requestedSearches = filters.flatMap((filter) =>
					(!filter.kinds || filter.kinds.includes(1)) && filter.search ? [filter.search] : []
				);
				const requestsStaleTextEvents = filters.some(
					(filter) =>
						(!filter.kinds || filter.kinds.includes(1)) &&
						filter.authors?.includes(staleContactPubkey)
				);
				const requestsRepostEvents = filters.some(
					(filter) =>
						(!filter.kinds || filter.kinds.includes(6)) &&
						(!filter.authors || filter.authors.includes(repostEvent.pubkey))
				);
				const requestsProfiles = filters.some(
					(filter) => filter.kinds?.includes(0) && filter.authors?.includes(textEvent.pubkey)
				);
				for (const filter of filters) {
					if (!filter.kinds?.includes(0) || !filter.authors) continue;

					const key = [...filter.authors].sort().join(',');
					relayProfileAuthorRequests[key] = (relayProfileAuthorRequests[key] ?? 0) + 1;
				}
				const requestsContactList = filters.some(
					(filter) => filter.kinds?.includes(3) && filter.authors?.includes(contactListAuthorPubkey)
				);
				const requestsEmptyAddressableList = filters.some(
					(filter) =>
						filter.kinds?.includes(30000) &&
						filter.authors?.includes(addressableListAuthorPubkey) &&
						filter['#d']?.includes('')
				);
				const requestsNamedAddressableList = filters.some(
					(filter) =>
						filter.kinds?.includes(30000) &&
						filter.authors?.includes(addressableListAuthorPubkey) &&
						filter['#d']?.includes('favorites')
				);

				if (requestsTextEvents) {
					setTimeout(() => {
						this.emitMessage(['EVENT', subId, textEvent]);
						this.emitMessage(['EVENT', subId, textEvent]);
					}, 5);
				}

				for (const search of requestedSearches) {
					relaySearchRequests[search] = (relaySearchRequests[search] ?? 0) + 1;
					setTimeout(() => {
						this.emitMessage(['EVENT', subId, search === 'edited' ? editedSearchEvent : textEvent]);
					}, 5);
				}

				if (requestsStaleTextEvents) {
					setTimeout(() => {
						this.emitMessage(['EVENT', subId, staleTextEvent]);
					}, 5);
				}

				if (requestsRepostEvents) {
					setTimeout(() => {
						this.emitMessage(['EVENT', subId, repostEvent]);
					}, 5);
				}

				if (requestsProfiles) {
					relayProfileRequests[textEvent.pubkey] =
						(relayProfileRequests[textEvent.pubkey] ?? 0) + 1;
					setTimeout(() => {
						this.emitMessage(['EVENT', subId, profileEvent]);
						this.emitMessage(['EVENT', subId, staleProfileEvent]);
					}, 20);
				}

				if (requestsContactList) {
					const address = `${contactListEvent.kind}:${contactListEvent.pubkey}:`;
					relayAddressRequests[address] = (relayAddressRequests[address] ?? 0) + 1;
					setTimeout(() => {
						this.emitMessage(['EVENT', subId, staleContactListEvent]);
						this.emitMessage(['EVENT', subId, contactListEvent]);
						this.emitMessage(['EOSE', subId]);
					}, 10);
				}

				if (requestsEmptyAddressableList) {
					const address = `${emptyAddressableListEvent.kind}:${emptyAddressableListEvent.pubkey}:`;
					relayAddressRequests[address] = (relayAddressRequests[address] ?? 0) + 1;
					setTimeout(() => {
						this.emitMessage(['EVENT', subId, emptyAddressableListEvent]);
						this.emitMessage(['EOSE', subId]);
					}, 10);
				}

				if (requestsNamedAddressableList) {
					const address = `${namedAddressableListEvent.kind}:${namedAddressableListEvent.pubkey}:favorites`;
					relayAddressRequests[address] = (relayAddressRequests[address] ?? 0) + 1;
					setTimeout(() => {
						this.emitMessage(['EVENT', subId, namedAddressableListEvent]);
						this.emitMessage(['EOSE', subId]);
					}, 10);
				}
			}

			close(code = 1000) {
				this.readyState = FakeWebSocket.CLOSED;
				this.dispatch('close', { type: 'close', code, reason: '' });
			}

			emitMessage(message: unknown) {
				this.dispatch('message', {
					type: 'message',
					data: JSON.stringify(message)
				});
			}

			dispatch(type: string, event?: unknown) {
				for (const callback of this.listeners[type] ?? []) {
					callback(event);
				}
			}
		}

		window.__NOSTTER_DECK_SKIP_NOSTR_VERIFY__ = true;
		window.__NOSTTER_DECK_WEBSOCKET_CTOR__ = FakeWebSocket as unknown as typeof WebSocket;
		window.__nostterFakeRelayConnections = relayConnections;
		window.__nostterFakeRelayProfileRequests = relayProfileRequests;
		window.__nostterFakeRelayProfileAuthorRequests = relayProfileAuthorRequests;
		window.__nostterFakeRelayAddressRequests = relayAddressRequests;
		window.__nostterFakeRelaySearchRequests = relaySearchRequests;
		window.__nostterFakeRelayTimelineAuthorRequests = relayTimelineAuthorRequests;
	});
}

export async function fakeRelayConnectionCounts(page: Page, relays: readonly string[]) {
	return page.evaluate((relayUrls) => {
		const connections = window.__nostterFakeRelayConnections ?? {};

		return Object.fromEntries(
			relayUrls.map((relay) => [
				relay,
				connections[relay] ?? connections[relay.replace(/\/$/, '')] ?? 0
			])
		);
	}, relays);
}
