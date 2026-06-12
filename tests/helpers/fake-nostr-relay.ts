import type { Page } from '@playwright/test';
import { Reaction, Repost, ShortTextNote } from 'nostr-tools/kinds';

declare global {
	interface Window {
		__NOSTTER_DECK_SKIP_NOSTR_VERIFY__?: boolean;
		__NOSTTER_DECK_WEBSOCKET_CTOR__?: typeof WebSocket;
		__nostterFakeRelayConnections?: Record<string, number>;
		__nostterFakeRelayProfileRequests?: Record<string, number>;
		__nostterFakeRelayProfileAuthorRequests?: Record<string, number>;
		__nostterFakeRelayAddressRequests?: Record<string, number>;
		__nostterFakeRelayEventIdRequests?: Record<string, number>;
		__nostterFakeRelaySearchRequests?: Record<string, number>;
		__nostterFakeRelayTimelineAuthorRequests?: Record<string, number>;
		__nostterFakeRelayNip11Requests?: string[];
	}
}

export async function installFakeNostrRelay(page: Page, options: { failNip11?: boolean } = {}) {
	await page.addInitScript(
		({ failNip11, reactionKind, repostKind, shortTextNoteKind }) => {
			const relayConnections: Record<string, number> = {};
			const relayProfileRequests: Record<string, number> = {};
			const relayProfileAuthorRequests: Record<string, number> = {};
			const relayAddressRequests: Record<string, number> = {};
			const relayEventIdRequests: Record<string, number> = {};
			const relaySearchRequests: Record<string, number> = {};
			const relayTimelineAuthorRequests: Record<string, number> = {};
			const relayNip11Requests: string[] = [];
			const nativeFetch = window.fetch.bind(window);
			window.fetch = async (input, init) => {
				const request = input instanceof Request ? input : null;
				const headers = new Headers(init?.headers ?? request?.headers);
				if (headers.get('Accept') === 'application/nostr+json') {
					relayNip11Requests.push(request?.url ?? String(input));
					if (failNip11) throw new TypeError('Failed to fetch');

					return new Response('{}', {
						headers: { 'Content-Type': 'application/nostr+json' }
					});
				}

				return nativeFetch(input, init);
			};
			const contactListAuthorPubkey =
				'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
			const addressableListAuthorPubkey =
				'dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd';
			const staleContactPubkey = 'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc';
			const profilePictureUrl = 'data:image/gif;base64,R0lGODlhAQABAAAAACwAAAAAAQABAAA=';
			const nostrNpub = 'nostr:npub1424242424242424242424242424242424242424242424242424qamrcaj';
			const nostrNprofile =
				'nostr:nprofile1qy28wumn8ghj7un9d3shjtn90psk6urvv5hsqg924242424242424242424242424242424242424242424242424gv3cla6';
			const nostrNote = 'nostr:note1zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zygsglnzgl';
			const nostrNevent =
				'nostr:nevent1qvzqqqqqqypzp242424242424242424242424242424242424242424242424242qy28wumn8ghj7un9d3shjtn90psk6urvv5hsqgq3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyuv4j77';
			const nostrNaddr =
				'nostr:naddr1qvzqqqr4gupzp242424242424242424242424242424242424242424242424242qy28wumn8ghj7un9d3shjtn90psk6urvv5hsqpmpwf6xjcmvv5hynj0x';
			const nostrChannelNevent =
				'nostr:nevent1qvzqqqqq9gpzpwamhwamhwamhwamhwamhwamhwamhwamhwamhwamhwamhwamhwamqy28wumn8ghj7un9d3shjtnyv9kh2uewd9hsqgpzyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zygrzt5kp';
			const nostrUnavailableNevent =
				'nostr:nevent1qqsrxvenxvenxvenxvenxvenxvenxvenxvenxvenxvenxvenxvenxvczpwyvz';
			const nostrFallbackNpub =
				'nostr:npub1lllllllllllllllllllllllllllllllllllllllllllllllllllsq7lrjw';
			const nostrNsec = 'nostr:nsec1yg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3qxh9tww';
			const imagePreviewUrl = 'https://example.com/image-without-extension';
			const linkPreviewUrl = 'https://example.com/article';
			const postEmojiUrl = 'https://example.com/emoji/post.png';
			const profileEmojiUrl = 'https://example.com/emoji/profile.png';
			const channelEmojiUrl = 'https://example.com/emoji/channel.png';
			const textEvent = {
				id: 'event-custom-timeline-1',
				pubkey: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
				created_at: Math.floor(Date.now() / 1000) - 90,
				kind: shortTextNoteKind,
				tags: [
					['t', 'nostter'],
					['t', 'nostter'],
					['emoji', 'deck', postEmojiUrl],
					['emoji', 'mixed', 'http://example.com/emoji/mixed.png']
				],
				content: `Hello from a custom Nostr timeline :deck: and blocked :mixed: ${imagePreviewUrl} ${imagePreviewUrl} ${linkPreviewUrl} https://example.com/path?from=nostter. www.example.com npub1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq0l98cr`,
				sig: '0'.repeat(128)
			};
			const nostrReferenceEvent = {
				id: 'event-custom-timeline-nostr-references',
				pubkey: 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
				created_at: textEvent.created_at - 2,
				kind: shortTextNoteKind,
				tags: [],
				content: `NIP-21 references ${nostrNpub} ${nostrNprofile} ${nostrNote} ${nostrNevent} ${nostrChannelNevent} ${nostrUnavailableNevent} ${nostrNaddr} ${nostrFallbackNpub} ${nostrNsec}`,
				sig: '0'.repeat(128)
			};
			const threadReplyEvent = {
				id: 'event-thread-reply',
				pubkey: 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
				created_at: textEvent.created_at + 10,
				kind: shortTextNoteKind,
				tags: [
					['e', textEvent.id, '', 'root'],
					['e', textEvent.id, '', 'reply']
				],
				content: 'Direct thread reply',
				sig: '0'.repeat(128)
			};
			const nestedThreadReplyEvent = {
				id: 'event-thread-nested-reply',
				pubkey: textEvent.pubkey,
				created_at: textEvent.created_at + 20,
				kind: shortTextNoteKind,
				tags: [
					['e', textEvent.id, '', 'root'],
					['e', threadReplyEvent.id, '', 'reply']
				],
				content: 'Nested thread reply',
				sig: '0'.repeat(128)
			};
			const quotedTextEvent = {
				id: '1'.repeat(64),
				pubkey: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
				created_at: textEvent.created_at - 10,
				kind: shortTextNoteKind,
				tags: [],
				content: 'Quoted short text note',
				sig: '0'.repeat(128)
			};
			const quotedChannelEvent = {
				id: '2'.repeat(64),
				pubkey: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
				created_at: textEvent.created_at - 20,
				kind: 42,
				tags: [
					['e', '4'.repeat(64), '', 'root'],
					['emoji', 'channel', channelEmojiUrl]
				],
				content: 'Quoted channel message :channel:',
				sig: '0'.repeat(128)
			};
			const longTextEvent = {
				id: 'event-custom-timeline-long-text',
				pubkey: 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
				created_at: textEvent.created_at - 1,
				kind: shortTextNoteKind,
				tags: [],
				content: [
					'Long post starts here.',
					...Array.from(
						{ length: 40 },
						(_, index) => `Long post line ${(index + 1).toString().padStart(2, '0')}`
					),
					'Long post ends here.'
				].join('\n'),
				sig: '0'.repeat(128)
			};
			const staleTextEvent = {
				id: 'event-stale-custom-timeline-1',
				pubkey: staleContactPubkey,
				created_at: Math.floor(Date.now() / 1000) - 100,
				kind: shortTextNoteKind,
				tags: [['t', 'nostter']],
				content: 'Hello from a stale contact list',
				sig: '0'.repeat(128)
			};
			const repostEvent = {
				id: 'event-custom-timeline-repost',
				pubkey: textEvent.pubkey,
				created_at: Math.floor(Date.now() / 1000) - 80,
				kind: repostKind,
				tags: [
					['e', textEvent.id],
					['p', textEvent.pubkey]
				],
				content: JSON.stringify(textEvent),
				sig: '0'.repeat(128)
			};
			const tagOnlyRepostEvent = {
				id: 'event-custom-timeline-repost-tag-only',
				pubkey: textEvent.pubkey,
				created_at: Math.floor(Date.now() / 1000) - 75,
				kind: repostKind,
				tags: [
					['e', textEvent.id],
					['p', textEvent.pubkey]
				],
				content: '',
				sig: '0'.repeat(128)
			};
			const reactionEvent = {
				id: 'event-custom-timeline-reaction',
				pubkey: textEvent.pubkey,
				created_at: Math.floor(Date.now() / 1000) - 72,
				kind: reactionKind,
				tags: [
					['e', textEvent.id],
					['p', textEvent.pubkey]
				],
				content: '+',
				sig: '0'.repeat(128)
			};
			const editedSearchEvent = {
				id: 'event-search-edited',
				pubkey: textEvent.pubkey,
				created_at: Math.floor(Date.now() / 1000) - 70,
				kind: shortTextNoteKind,
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
				tags: [['emoji', 'profile', profileEmojiUrl]],
				content: JSON.stringify({
					display_name: 'Alice Relay',
					picture: profilePictureUrl,
					banner: profilePictureUrl,
					about: 'Alice profile from the relay :profile:',
					nip05: 'alice@example.com',
					website: 'https://example.com/alice'
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
			const bulkCreatedAt = Math.floor(Date.now() / 1000) - 60;
			const bulkEvents = Array.from({ length: 250 }, (_, index) => ({
				id: index.toString(16).padStart(64, '0'),
				pubkey: textEvent.pubkey,
				created_at: bulkCreatedAt,
				kind: shortTextNoteKind,
				tags: [],
				content: `Bulk event ${index.toString().padStart(3, '0')}`,
				sig: '0'.repeat(128)
			}));

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
						ids?: string[];
						'#d'?: string[];
						'#e'?: string[];
						search?: string;
						since?: number;
						until?: number;
					}>;
					const matchesFilterTime = (
						event: { created_at: number },
						filter: { since?: number; until?: number }
					) =>
						(filter.since === undefined || event.created_at >= filter.since) &&
						(filter.until === undefined || event.created_at <= filter.until);
					const requestsTextEvents = filters.some(
						(filter) =>
							matchesFilterTime(textEvent, filter) &&
							!filter.search &&
							!filter.ids &&
							(!filter.kinds || filter.kinds.includes(shortTextNoteKind)) &&
							(!filter.authors || filter.authors.includes(textEvent.pubkey))
					);
					const requestedEventIds = filters.flatMap((filter) => filter.ids ?? []);
					const requestsThreadEvents = filters.some(
						(filter) =>
							filter.kinds?.includes(shortTextNoteKind) && filter['#e']?.includes(textEvent.id)
					);
					const requestsProfilePosts = filters.some(
						(filter) =>
							filter.kinds?.includes(shortTextNoteKind) &&
							filter.kinds.includes(repostKind) &&
							filter.authors?.includes(textEvent.pubkey)
					);
					for (const filter of filters) {
						if (
							filter.search ||
							(filter.kinds && !filter.kinds.includes(shortTextNoteKind)) ||
							!filter.authors
						) {
							continue;
						}
						const key = [...filter.authors].sort().join(',');
						relayTimelineAuthorRequests[key] = (relayTimelineAuthorRequests[key] ?? 0) + 1;
					}
					const requestedSearches = filters.flatMap((filter) =>
						matchesFilterTime(searchPreviewEvent(filter.search), filter) &&
						(!filter.kinds || filter.kinds.includes(shortTextNoteKind)) &&
						filter.search
							? [filter.search]
							: []
					);
					const requestsStaleTextEvents = filters.some(
						(filter) =>
							matchesFilterTime(staleTextEvent, filter) &&
							!filter.ids &&
							(!filter.kinds || filter.kinds.includes(shortTextNoteKind)) &&
							filter.authors?.includes(staleContactPubkey)
					);
					const requestsRepostEvents = filters.some(
						(filter) =>
							matchesFilterTime(repostEvent, filter) &&
							(!filter.kinds || filter.kinds.includes(repostKind)) &&
							(!filter.authors || filter.authors.includes(repostEvent.pubkey))
					);
					const requestsReactionEvents = filters.some(
						(filter) =>
							matchesFilterTime(reactionEvent, filter) &&
							(!filter.kinds || filter.kinds.includes(reactionKind)) &&
							(!filter.authors || filter.authors.includes(reactionEvent.pubkey))
					);
					const requestsProfiles = filters.some(
						(filter) =>
							matchesFilterTime(profileEvent, filter) &&
							filter.kinds?.includes(0) &&
							filter.authors?.includes(textEvent.pubkey)
					);
					for (const filter of filters) {
						if (!filter.kinds?.includes(0) || !filter.authors) continue;

						const key = [...filter.authors].sort().join(',');
						relayProfileAuthorRequests[key] = (relayProfileAuthorRequests[key] ?? 0) + 1;
					}
					const requestsContactList = filters.some(
						(filter) =>
							matchesFilterTime(contactListEvent, filter) &&
							filter.kinds?.includes(3) &&
							filter.authors?.includes(contactListAuthorPubkey)
					);
					const requestsEmptyAddressableList = filters.some(
						(filter) =>
							matchesFilterTime(emptyAddressableListEvent, filter) &&
							filter.kinds?.includes(30000) &&
							filter.authors?.includes(addressableListAuthorPubkey) &&
							filter['#d']?.includes('')
					);
					const requestsNamedAddressableList = filters.some(
						(filter) =>
							matchesFilterTime(namedAddressableListEvent, filter) &&
							filter.kinds?.includes(30000) &&
							filter.authors?.includes(addressableListAuthorPubkey) &&
							filter['#d']?.includes('favorites')
					);

					if (requestsTextEvents) {
						setTimeout(() => {
							this.emitMessage(['EVENT', subId, textEvent]);
							this.emitMessage(['EVENT', subId, textEvent]);
							this.emitMessage(['EVENT', subId, longTextEvent]);
							this.emitMessage(['EVENT', subId, nostrReferenceEvent]);
						}, 5);
					}

					if (requestsThreadEvents) {
						setTimeout(() => {
							this.emitMessage(['EVENT', subId, nestedThreadReplyEvent]);
							this.emitMessage(['EVENT', subId, threadReplyEvent]);
							this.emitMessage(['EOSE', subId]);
						}, 5);
					}

					if (requestsProfilePosts) {
						setTimeout(() => {
							this.emitMessage(['EVENT', subId, nestedThreadReplyEvent]);
						}, 5);
					}

					for (const search of requestedSearches) {
						relaySearchRequests[search] = (relaySearchRequests[search] ?? 0) + 1;
						setTimeout(() => {
							if (search === 'bulk') {
								for (const event of [...bulkEvents].reverse()) {
									this.emitMessage(['EVENT', subId, event]);
								}
								return;
							}

							this.emitMessage([
								'EVENT',
								subId,
								search === 'edited'
									? editedSearchEvent
									: search === 'thread-entry'
										? threadReplyEvent
										: textEvent
							]);
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
							this.emitMessage(['EVENT', subId, tagOnlyRepostEvent]);
						}, 5);
					}

					if (requestsReactionEvents) {
						setTimeout(() => {
							this.emitMessage(['EVENT', subId, reactionEvent]);
						}, 5);
					}

					if (requestedEventIds.includes(textEvent.id)) {
						relayEventIdRequests[textEvent.id] = (relayEventIdRequests[textEvent.id] ?? 0) + 1;
						setTimeout(() => {
							this.emitMessage(['EVENT', subId, textEvent]);
							this.emitMessage(['EOSE', subId]);
						}, 5);
					}

					for (const quotedEvent of [quotedTextEvent, quotedChannelEvent]) {
						if (!requestedEventIds.includes(quotedEvent.id)) continue;

						relayEventIdRequests[quotedEvent.id] = (relayEventIdRequests[quotedEvent.id] ?? 0) + 1;
						setTimeout(() => {
							this.emitMessage(['EVENT', subId, quotedEvent]);
						}, 5);
					}

					if (requestedEventIds.length > 0) {
						setTimeout(() => this.emitMessage(['EOSE', subId]), 15);
					}

					function searchPreviewEvent(search: string | undefined) {
						if (search === 'bulk') return bulkEvents[0] ?? textEvent;
						if (search === 'thread-entry') return threadReplyEvent;
						return search === 'edited' ? editedSearchEvent : textEvent;
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
			window.__nostterFakeRelayEventIdRequests = relayEventIdRequests;
			window.__nostterFakeRelaySearchRequests = relaySearchRequests;
			window.__nostterFakeRelayTimelineAuthorRequests = relayTimelineAuthorRequests;
			window.__nostterFakeRelayNip11Requests = relayNip11Requests;
		},
		{
			failNip11: options.failNip11 === true,
			reactionKind: Reaction,
			repostKind: Repost,
			shortTextNoteKind: ShortTextNote
		}
	);
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
