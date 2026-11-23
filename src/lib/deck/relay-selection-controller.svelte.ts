import type { AccountRecord } from '$lib/nostr/accounts';
import {
	getCachedNip65RelayTags,
	getNip65ReadRelays,
	getNip65WriteRelays,
	refreshNip65Relays,
	type Nip65RelayTag
} from '$lib/nostr/nip65';
import { normalizePubkey } from '$lib/nostr/pubkeys';
import { resolveRelaySelection as resolveSelectionRelays } from '$lib/nostr/relays';
import type { ColumnConfig } from './types';
import type { RelaySelection } from '$lib/nostr/relays';

export type AccountRelayOption = {
	pubkey: string;
};

type RelaySelectionControllerOptions = {
	getAccounts: () => AccountRecord[];
	getColumnConfigs: () => ColumnConfig[];
	getCachedRelayTags?: (pubkey: string) => Nip65RelayTag[];
	refreshRelayTags?: (pubkey: string) => Promise<Nip65RelayTag[] | null>;
};

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
		if (
			column.type !== 'timeline' ||
			!('relays' in column) ||
			(column.relays.type !== 'nip65' && column.relays.type !== 'nip65-write')
		) {
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
	getCachedRelayTags = getCachedNip65RelayTags,
	refreshRelayTags = refreshNip65Relays
}: RelaySelectionControllerOptions) {
	const relayTagsByPubkey = $state<Record<string, Nip65RelayTag[]>>({});
	const requestedPubkeys: string[] = [];
	const accountRelayOptions = $derived(getAccountRelayOptions(getAccounts()));

	function getRelayTags(pubkey: string) {
		const normalized = normalizePubkey(pubkey);
		return normalized ? (relayTagsByPubkey[normalized] ?? getCachedRelayTags(normalized)) : [];
	}

	function refreshNip65RelayList(pubkey: string) {
		const normalizedPubkey = normalizePubkey(pubkey);
		if (!normalizedPubkey || requestedPubkeys.includes(normalizedPubkey)) {
			return;
		}

		requestedPubkeys.push(normalizedPubkey);
		void refreshRelayTags(normalizedPubkey).then((relayTags) => {
			if (relayTags !== null) {
				relayTagsByPubkey[normalizedPubkey] = relayTags;
			}
		});
	}

	function resolveRelaySelection(selection: RelaySelection) {
		return resolveSelectionRelays(
			selection,
			(pubkey) => getNip65ReadRelays(getRelayTags(pubkey)),
			(pubkey) => getNip65WriteRelays(getRelayTags(pubkey))
		);
	}

	$effect(() => {
		for (const pubkey of getNip65RelaySelectionPubkeys(getColumnConfigs())) {
			refreshNip65RelayList(pubkey);
		}
	});

	return {
		get accountRelayOptions() {
			return accountRelayOptions;
		},
		refreshNip65RelayList,
		resolveRelaySelection
	};
}
