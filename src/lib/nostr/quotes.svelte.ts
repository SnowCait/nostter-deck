import { ChannelMessage, ShortTextNote } from 'nostr-tools/kinds';
import { createRxBackwardReq, uniq, type LazyFilter } from 'rx-nostr';
import { SvelteMap } from 'svelte/reactivity';
import type { Unsubscribable } from 'rxjs';
import type * as Nostr from 'nostr-typedef';
import { loadEventById, storeEvent } from '$lib/deck/timeline-cache';
import { getNostrClient } from './client';
import { requestProfiles } from './profiles';
import { combineRelays, defaultRelays, profileRelays } from './relays';

export type NostrQuoteState =
	| { status: 'loading' }
	| { status: 'loaded'; event: Nostr.Event }
	| { status: 'unavailable' };

type QuoteEntry = {
	references: number;
	relayHints: Set<string>;
	state: NostrQuoteState;
	subscription?: Unsubscribable;
	timeoutId?: ReturnType<typeof setTimeout>;
};

const quoteTimeoutMs = 10_000;
// eslint-disable-next-line svelte/prefer-svelte-reactivity -- Internal request bookkeeping is exposed through quoteStates.
const quoteEntries = new Map<string, QuoteEntry>();
const quoteStates = new SvelteMap<string, NostrQuoteState>();

export function getNostrQuoteState(eventId: string) {
	return quoteStates.get(eventId);
}

export function requestNostrQuote(eventId: string, relayHints: string[]) {
	let entry = quoteEntries.get(eventId);
	if (!entry) {
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- Relay hints do not directly drive rendering.
		entry = { references: 0, relayHints: new Set(relayHints), state: { status: 'loading' } };
		quoteEntries.set(eventId, entry);
		quoteStates.set(eventId, entry.state);
		void loadQuote(eventId, entry);
	} else {
		for (const relay of relayHints) entry.relayHints.add(relay);
	}
	entry.references += 1;

	let isReleased = false;
	return () => {
		if (isReleased) return;
		isReleased = true;
		releaseQuote(eventId, entry);
	};
}

function releaseQuote(eventId: string, entry: QuoteEntry) {
	entry.references = Math.max(0, entry.references - 1);
	if (entry.references > 0 || quoteEntries.get(eventId) !== entry) return;

	entry.subscription?.unsubscribe();
	if (entry.timeoutId) clearTimeout(entry.timeoutId);
	quoteEntries.delete(eventId);
	quoteStates.delete(eventId);
}

async function loadQuote(eventId: string, entry: QuoteEntry) {
	const cachedEvent = await loadEventById(eventId);
	if (quoteEntries.get(eventId) !== entry) return;
	if (cachedEvent) {
		finishQuote(eventId, entry, cachedEvent);
		return;
	}

	const relayUrls = combineRelays([...defaultRelays], [...entry.relayHints]);
	const request = createRxBackwardReq();
	entry.subscription = getNostrClient()
		.use(request)
		.pipe(uniq())
		.subscribe({
			next: ({ event }) => {
				if (event.id === eventId) finishQuote(eventId, entry, event);
			},
			complete: () => finishUnavailable(eventId, entry)
		});
	entry.timeoutId = setTimeout(() => finishUnavailable(eventId, entry), quoteTimeoutMs);
	request.emit({ ids: [eventId] } as LazyFilter, { relays: relayUrls });
	request.over();
}

function finishQuote(eventId: string, entry: QuoteEntry, event: Nostr.Event) {
	if (quoteEntries.get(eventId) !== entry || entry.state.status !== 'loading') return;

	void storeEvent(event);
	if (!isSupportedQuoteEvent(event)) {
		finishUnavailable(eventId, entry);
		return;
	}

	entry.subscription?.unsubscribe();
	if (entry.timeoutId) clearTimeout(entry.timeoutId);
	entry.state = { status: 'loaded', event };
	quoteStates.set(eventId, entry.state);
	requestProfiles(
		[event.pubkey],
		combineRelays([...profileRelays], [...defaultRelays], [...entry.relayHints])
	);
}

function finishUnavailable(eventId: string, entry: QuoteEntry) {
	if (quoteEntries.get(eventId) !== entry || entry.state.status !== 'loading') return;

	entry.subscription?.unsubscribe();
	if (entry.timeoutId) clearTimeout(entry.timeoutId);
	entry.state = { status: 'unavailable' };
	quoteStates.set(eventId, entry.state);
}

function isSupportedQuoteEvent(event: Nostr.Event) {
	return event.kind === ShortTextNote || event.kind === ChannelMessage;
}
