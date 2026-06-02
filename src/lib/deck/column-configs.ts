import { readJsonStorage, writeJsonStorage } from '$lib/local-storage';
import { normalizeNostrFilters } from '$lib/nostr/filters';
import { normalizeRelays, normalizeRelaySelection } from '$lib/nostr/relays';
import { getDefaultColumnIconKey, isColumnIconKey } from './column-icons';
import { columnSourceKeys } from './data';
import type { ColumnConfig, ColumnDisplayConfig, ColumnSourceKey, ColumnWidth } from './types';
import { normalizeWebsiteUrl } from './website-url';

export const columnWidths = ['wide', 'standard', 'narrow'] as const;

const columnConfigsStorageKey = 'nostter:column-configs';

function isColumnSourceKey(value: unknown): value is ColumnSourceKey {
	return typeof value === 'string' && columnSourceKeys.includes(value as ColumnSourceKey);
}

function isColumnWidth(value: unknown): value is ColumnWidth {
	return typeof value === 'string' && columnWidths.includes(value as ColumnWidth);
}

function normalizeColumnDisplayConfig(
	candidate: Partial<ColumnDisplayConfig>,
	defaultIconKey: unknown
): ColumnDisplayConfig {
	const title = typeof candidate.title === 'string' ? candidate.title.trim() : '';
	const icon =
		isColumnIconKey(candidate.icon) && candidate.icon !== defaultIconKey ? candidate.icon : null;
	return {
		...(title ? { title } : {}),
		...(icon ? { icon } : {})
	};
}

function normalizeColumnConfigs(value: unknown): ColumnConfig[] {
	if (!Array.isArray(value) || value.length === 0) return [];

	const columns = value.flatMap((item): ColumnConfig[] => {
		if (!item || typeof item !== 'object') return [];

		const candidate = item as Partial<ColumnConfig>;
		if (typeof candidate.id !== 'string' || candidate.id.length === 0) return [];
		if (!isColumnWidth(candidate.width)) return [];

		if (candidate.type === 'timeline') {
			if (candidate.timelineKind === 'preset') {
				if (!isColumnSourceKey(candidate.sourceKey)) return [];
				const pubkey = (candidate as { pubkey?: unknown }).pubkey;
				const relays = (candidate as { relays?: unknown }).relays;
				const query = (candidate as { query?: unknown }).query;
				if (candidate.sourceKey === 'timeline_follow') {
					if (typeof pubkey !== 'string' || !/^[0-9a-f]{64}$/i.test(pubkey)) return [];
					const normalizedRelays =
						Array.isArray(relays) && relays.length > 0 ? normalizeRelays(relays) : [];
					if (!normalizedRelays) return [];

					const column = {
						id: candidate.id,
						type: 'timeline',
						timelineKind: 'preset',
						sourceKey: candidate.sourceKey,
						pubkey: pubkey.toLowerCase(),
						relays: normalizedRelays,
						width: candidate.width
					} satisfies ColumnConfig;

					return [
						{
							...column,
							...normalizeColumnDisplayConfig(candidate, getDefaultColumnIconKey(column))
						}
					];
				}
				if (candidate.sourceKey === 'timeline_search') {
					if (typeof query !== 'string' || query.trim().length === 0) return [];

					const column = {
						id: candidate.id,
						type: 'timeline',
						timelineKind: 'preset',
						sourceKey: candidate.sourceKey,
						query: query.trim(),
						width: candidate.width
					} satisfies ColumnConfig;

					return [
						{
							...column,
							...normalizeColumnDisplayConfig(candidate, getDefaultColumnIconKey(column))
						}
					];
				}

				return [];
			}

			if (candidate.timelineKind === 'custom') {
				const filters = normalizeNostrFilters(candidate.filters);
				if (!filters) return [];
				const relays = normalizeRelaySelection(candidate.relays);
				if (!relays) return [];

				const column = {
					id: candidate.id,
					type: 'timeline',
					timelineKind: 'custom',
					filters,
					relays,
					width: candidate.width
				} satisfies ColumnConfig;

				return [
					{
						...column,
						...normalizeColumnDisplayConfig(candidate, getDefaultColumnIconKey(column))
					}
				];
			}

			return [];
		}

		if (candidate.type === 'website') {
			if (typeof candidate.url !== 'string') return [];

			const url = normalizeWebsiteUrl(candidate.url);
			if (!url) return [];

			const column = {
				id: candidate.id,
				type: 'website',
				url,
				width: candidate.width
			} satisfies ColumnConfig;

			return [
				{
					...column,
					...normalizeColumnDisplayConfig(candidate, getDefaultColumnIconKey(column))
				}
			];
		}

		return [];
	});

	return columns;
}

export function readColumnConfigs(): ColumnConfig[] {
	return readJsonStorage(columnConfigsStorageKey, [], normalizeColumnConfigs);
}

export function writeColumnConfigs(nextColumnConfigs: ColumnConfig[]) {
	writeJsonStorage(columnConfigsStorageKey, nextColumnConfigs, normalizeColumnConfigs);
}

export { columnConfigsStorageKey };
