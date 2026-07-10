import type { AccountRecord } from '$lib/nostr/accounts';
import {
	getCachedNip65RelayTags,
	getNip65ReadRelays,
	refreshNip65Relays,
	type Nip65RelayTag
} from '$lib/nostr/nip65';
import { normalizePubkey } from '$lib/nostr/pubkeys';
import { defaultRelays, resolveRelaySelection as resolveSelectionRelays } from '$lib/nostr/relays';
import type { ColumnConfig, RelaySelection } from './types';

export type AccountRelayOption = {
	pubkey: string;
};

type RelaySelectionControllerOptions = {
	getAccounts: () => AccountRecord[];
	getColumnConfigs: () => ColumnConfig[];
	refreshRelayTags?: (pubkey: string) => Promise<Nip65RelayTag[] | null>;
};

function sameRelays(left: string[], right: string[]) {
	return left.length === right.length && left.every((relay, index) => relay === right[index]);
}

export function getAccountRelayOptions(accounts: AccountRecord[]): AccountRelayOption[] {
	const seenPubkeys: string[] = [];
	const options: AccountRelayOption[] = [];
	for (const account of accounts) {
		const pubkey = normalizePubkey(account.pubkey);
		if (!pubkey || seenPubkeys.includes(pubkey)) {
			continue;
		}

		seenPubkeys.push(pubkey);
		options.push({ pubkey });
	}
	return options;
}

export function getNip65RelaySelectionPubkeys(columns: ColumnConfig[]) {
	const pubkeys: string[] = [];
	for (const column of columns) {
		if (column.type !== 'timeline' || !('relays' in column) || column.relays.type !== 'nip65') {
			continue;
		}

		const pubkey = normalizePubkey(column.relays.pubkey);
		if (pubkey && !pubkeys.includes(pubkey)) {
			pubkeys.push(pubkey);
		}
	}
	return pubkeys;
}

export function createRelaySelectionController({
	getAccounts,
	getColumnConfigs,
	refreshRelayTags = refreshNip65Relays
}: RelaySelectionControllerOptions) {
	let nip65ReadRelaysByPubkey = $state<Record<string, string[]>>({});
	const requestedPubkeys: string[] = [];
	const refreshTokens: Record<string, number> = {};

	const accountRelayOptions = $derived(getAccountRelayOptions(getAccounts()));

	function setNip65ReadRelays(pubkey: string, relays: string[]) {
		if (sameRelays(nip65ReadRelaysByPubkey[pubkey] ?? [], relays)) {
			return;
		}

		nip65ReadRelaysByPubkey = {
			...nip65ReadRelaysByPubkey,
			[pubkey]: relays
		};
	}

	function getCachedReadRelays(pubkey: string) {
		return getNip65ReadRelays(getCachedNip65RelayTags(pubkey));
	}

	function getNip65ReadRelayUrls(pubkey: string) {
		const normalizedPubkey = normalizePubkey(pubkey);
		if (!normalizedPubkey) {
			return [...defaultRelays];
		}

		const relays =
			nip65ReadRelaysByPubkey[normalizedPubkey] ?? getCachedReadRelays(normalizedPubkey);
		return relays.length > 0 ? relays : [...defaultRelays];
	}

	function refreshNip65ReadRelays(pubkey: string) {
		const normalizedPubkey = normalizePubkey(pubkey);
		if (!normalizedPubkey || requestedPubkeys.includes(normalizedPubkey)) {
			return;
		}

		requestedPubkeys.push(normalizedPubkey);
		setNip65ReadRelays(normalizedPubkey, getCachedReadRelays(normalizedPubkey));
		const token = (refreshTokens[normalizedPubkey] ?? 0) + 1;
		refreshTokens[normalizedPubkey] = token;
		void refreshRelayTags(normalizedPubkey).then((relayTags) => {
			if (refreshTokens[normalizedPubkey] !== token || relayTags === null) {
				return;
			}

			setNip65ReadRelays(normalizedPubkey, getNip65ReadRelays(relayTags));
		});
	}

	function resolveRelaySelection(selection: RelaySelection) {
		return resolveSelectionRelays(selection, getNip65ReadRelayUrls);
	}

	$effect(() => {
		for (const pubkey of getNip65RelaySelectionPubkeys(getColumnConfigs())) {
			refreshNip65ReadRelays(pubkey);
		}
	});

	return {
		get accountRelayOptions() {
			return accountRelayOptions;
		},
		getNip65ReadRelayUrls,
		refreshNip65ReadRelays,
		resolveRelaySelection
	};
}
