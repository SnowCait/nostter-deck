import type { RelaySelection } from '$lib/deck/types';

export const defaultRelays = ['wss://relay.damus.io/', 'wss://nos.lol/'] as const;
export const searchRelays = ['wss://nostr.wine/', 'wss://search.nos.today/'] as const;
export const profileRelays = [
	'wss://purplepag.es/',
	'wss://user.kindpag.es/',
	'wss://directory.yabu.me/',
	'wss://profiles.nostr1.com/'
] as const;

const defaultRelaySet = new Set<string>(defaultRelays);

function isLoopbackHostname(hostname: string) {
	if (
		hostname === 'localhost' ||
		hostname === 'localhost.' ||
		hostname.endsWith('.localhost') ||
		hostname.endsWith('.localhost.')
	) {
		return true;
	}

	if (hostname === '[::1]') return true;

	const ipv4Parts = hostname.split('.');
	return (
		ipv4Parts.length === 4 &&
		ipv4Parts.every((part) => /^\d+$/.test(part)) &&
		Number(ipv4Parts[0]) === 127
	);
}

export function normalizeRelay(value: unknown): string | null {
	if (typeof value !== 'string') return null;

	try {
		const url = new URL(value.trim());
		return url.protocol === 'wss:' || (url.protocol === 'ws:' && isLoopbackHostname(url.hostname))
			? url.href
			: null;
	} catch {
		return null;
	}
}

function uniqueRelays(relays: string[]) {
	return [...new Set(relays)];
}

export function combineRelays(...relayGroups: readonly string[][]) {
	return uniqueRelays(relayGroups.flat());
}

export function normalizeRelays(value: unknown): string[] | null {
	if (!Array.isArray(value) || value.length === 0) return null;

	const relays = value.map(normalizeRelay);
	if (relays.some((relay) => relay === null)) return null;

	return uniqueRelays(relays as string[]);
}

export function normalizeRelaySelection(value: unknown): RelaySelection | null {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return null;

	const candidate = value as Partial<RelaySelection>;
	if (candidate.type === 'default') return { type: 'default' };

	if (candidate.type === 'custom') {
		const urls = normalizeRelays(candidate.urls);
		return urls ? { type: 'custom', urls } : null;
	}

	return null;
}

export function resolveRelaySelection(selection: RelaySelection) {
	return selection.type === 'default' ? [...defaultRelays] : selection.urls;
}

export function parseCustomRelays(value: string): string[] | null {
	const lines = value
		.split('\n')
		.map((line) => line.trim())
		.filter((line) => line.length > 0);

	if (lines.length === 0) return [];

	const relays = lines.map(normalizeRelay);
	if (relays.some((relay) => relay === null)) return null;

	return uniqueRelays(relays as string[]);
}

export function resolveRelays(selectedRelays: string[], customRelays: string): string[] | null {
	const normalizedSelectedRelays = selectedRelays.map(normalizeRelay);
	if (normalizedSelectedRelays.some((relay) => relay === null)) return null;

	const parsedCustomRelays = parseCustomRelays(customRelays);
	if (!parsedCustomRelays) return null;

	const relays = uniqueRelays([...(normalizedSelectedRelays as string[]), ...parsedCustomRelays]);
	return relays.length > 0 ? relays : null;
}

export function resolveRelayDraft(
	selectedRelays: string[],
	customRelays: string
): RelaySelection | null {
	const relays = resolveRelays(selectedRelays, customRelays);
	if (!relays) return null;

	const isDefaultSelection =
		customRelays.trim().length === 0 &&
		defaultRelays.length === relays.length &&
		defaultRelays.every((relay) => relays.includes(relay));

	return isDefaultSelection ? { type: 'default' } : { type: 'custom', urls: relays };
}

export function getSelectedDefaultRelays(relays: string[]) {
	return relays.filter((relay) => defaultRelaySet.has(relay));
}

export function formatCustomRelays(relays: string[]) {
	return relays.filter((relay) => !defaultRelaySet.has(relay)).join('\n');
}
