import type { NostrFilter } from '$lib/deck/types';

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function normalizeNostrFilters(value: unknown): NostrFilter[] | null {
	if (!Array.isArray(value) || value.length === 0) return null;
	if (!value.every(isPlainObject)) return null;

	return value.map((filter) => ({ ...filter }));
}

export function parseNostrFilters(value: string): NostrFilter[] | null {
	try {
		return normalizeNostrFilters(JSON.parse(value));
	} catch {
		return null;
	}
}
