import { columnSourceKeys, initialColumnConfigs } from './data';
import type { ColumnConfig, ColumnSourceKey, ColumnWidth } from './types';

export const columnWidths = ['wide', 'standard', 'narrow'] as const;

const columnConfigsStorageKey = 'nostter:column-configs';

function canUseLocalStorage() {
	return typeof localStorage !== 'undefined';
}

function isColumnSourceKey(value: unknown): value is ColumnSourceKey {
	return typeof value === 'string' && columnSourceKeys.includes(value as ColumnSourceKey);
}

function isColumnWidth(value: unknown): value is ColumnWidth {
	return typeof value === 'string' && columnWidths.includes(value as ColumnWidth);
}

function defaultColumnConfigs() {
	return initialColumnConfigs.map((column) => ({ ...column }));
}

function normalizeColumnConfigs(value: unknown): ColumnConfig[] {
	if (!Array.isArray(value) || value.length === 0) return defaultColumnConfigs();

	const columns = value.flatMap((item): ColumnConfig[] => {
		if (!item || typeof item !== 'object') return [];

		const candidate = item as Partial<ColumnConfig>;
		if (typeof candidate.id !== 'string' || candidate.id.length === 0) return [];
		if (!isColumnSourceKey(candidate.sourceKey)) return [];
		if (!isColumnWidth(candidate.width)) return [];

		return [
			{
				id: candidate.id,
				sourceKey: candidate.sourceKey,
				width: candidate.width
			}
		];
	});

	return columns.length > 0 ? columns : defaultColumnConfigs();
}

export function readColumnConfigs(): ColumnConfig[] {
	if (!canUseLocalStorage()) return defaultColumnConfigs();

	try {
		const storedValue = localStorage.getItem(columnConfigsStorageKey);
		if (!storedValue) return defaultColumnConfigs();

		return normalizeColumnConfigs(JSON.parse(storedValue));
	} catch {
		return defaultColumnConfigs();
	}
}

export function writeColumnConfigs(nextColumnConfigs: ColumnConfig[]) {
	if (!canUseLocalStorage()) return;

	localStorage.setItem(
		columnConfigsStorageKey,
		JSON.stringify(normalizeColumnConfigs(nextColumnConfigs))
	);
}

export { columnConfigsStorageKey };
