import { isAddressableKind, isReplaceableKind } from 'nostr-tools/kinds';
import type { NostrFilter } from '$lib/deck/types';

export type AuthorAddress = {
	key: string;
	kind: number;
	pubkey: string;
	identifier: string;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isPubkey(value: unknown): value is string {
	return typeof value === 'string' && /^[0-9a-f]{64}$/i.test(value);
}

function isAuthorsArray(value: unknown): value is string[] {
	return Array.isArray(value) && value.every(isPubkey);
}

export function parseAuthorAddress(value: unknown): AuthorAddress | null {
	if (typeof value !== 'string') return null;

	const match = value.match(/^(\d+):([0-9a-f]{64}):(.*)$/i);
	if (!match) return null;
	const kind = Number.parseInt(match[1], 10);
	const isReplaceable = isReplaceableKind(kind);
	const isAddressable = isAddressableKind(kind);
	if (!isReplaceable && !isAddressable) return null;
	const identifier = isReplaceable ? '' : match[3];
	if (isReplaceable && match[3].length > 0) return null;

	return {
		key: `${kind}:${match[2].toLowerCase()}:${identifier}`,
		kind,
		pubkey: match[2].toLowerCase(),
		identifier
	};
}

function normalizeNostrFilter(filter: Record<string, unknown>): NostrFilter | null {
	if (!('authors' in filter)) return { ...filter };

	const authors = filter.authors;
	if (isAuthorsArray(authors) || parseAuthorAddress(authors)) return { ...filter };

	return null;
}

export function normalizeNostrFilters(value: unknown): NostrFilter[] | null {
	if (!Array.isArray(value) || value.length === 0) return null;
	if (!value.every(isPlainObject)) return null;

	const filters = value.map(normalizeNostrFilter);
	if (filters.some((filter) => filter === null)) return null;

	return filters as NostrFilter[];
}

export function parseNostrFilters(value: string): NostrFilter[] | null {
	try {
		return normalizeNostrFilters(JSON.parse(value));
	} catch {
		return null;
	}
}

export function getFilterAuthorAddress(filter: NostrFilter) {
	return parseAuthorAddress(filter.authors);
}

export function expandAddressAuthors(filter: NostrFilter, authors: string[]): NostrFilter | null {
	const uniqueAuthors = [
		...new Set(authors.filter(isPubkey).map((author) => author.toLowerCase()))
	];
	if (uniqueAuthors.length === 0) return null;

	return {
		...filter,
		authors: uniqueAuthors
	};
}
