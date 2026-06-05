import { getDefaultColumnIconKey } from './column-icons';
import type {
	ColumnConfig,
	ColumnIconKey,
	ColumnWidth,
	NostrFilter,
	RelaySelection
} from './types';
import type { ChannelPointer, ProfilePointer } from '$lib/nostr/nip19';

export function updateColumnWidth(
	columns: ColumnConfig[],
	columnId: string,
	width: ColumnWidth
): ColumnConfig[] {
	return columns.map((column) => (column.id === columnId ? { ...column, width } : column));
}

export function updateColumnTitle(
	columns: ColumnConfig[],
	columnId: string,
	title: string
): ColumnConfig[] {
	const nextTitle = title.trim();
	return columns.map((column) => {
		if (column.id !== columnId) return column;

		if (!nextTitle) {
			const nextColumn = { ...column };
			delete nextColumn.title;
			return nextColumn;
		}

		return { ...column, title: nextTitle };
	});
}

export function updateColumnIcon(
	columns: ColumnConfig[],
	columnId: string,
	icon: ColumnIconKey | null
): ColumnConfig[] {
	return columns.map((column) => {
		if (column.id !== columnId) return column;

		if (!icon || icon === getDefaultColumnIconKey(column)) {
			const nextColumn = { ...column };
			delete nextColumn.icon;
			return nextColumn;
		}

		return { ...column, icon };
	});
}

export function saveCustomTimelineSettings(
	columns: ColumnConfig[],
	columnId: string,
	filters: NostrFilter[],
	relays: RelaySelection
): ColumnConfig[] {
	return columns.map((column) =>
		column.id === columnId && column.type === 'timeline' && column.timelineKind === 'custom'
			? { ...column, filters, relays }
			: column
	);
}

export function saveFollowSettings(
	columns: ColumnConfig[],
	columnId: string,
	profile: ProfilePointer
): ColumnConfig[] {
	return columns.map((column) =>
		column.id === columnId &&
		column.type === 'timeline' &&
		column.timelineKind === 'preset' &&
		column.sourceKey === 'timeline_follow'
			? { ...column, pubkey: profile.pubkey, relays: profile.relays }
			: column
	);
}

export function saveSearchSettings(
	columns: ColumnConfig[],
	columnId: string,
	query: string
): ColumnConfig[] {
	const nextQuery = query.trim();
	if (nextQuery.length === 0) return columns;

	return columns.map((column) =>
		column.id === columnId &&
		column.type === 'timeline' &&
		column.timelineKind === 'preset' &&
		column.sourceKey === 'timeline_search'
			? { ...column, query: nextQuery }
			: column
	);
}

export function saveChannelSettings(
	columns: ColumnConfig[],
	columnId: string,
	channel: ChannelPointer
): ColumnConfig[] {
	return columns.map((column) =>
		column.id === columnId &&
		column.type === 'timeline' &&
		column.timelineKind === 'preset' &&
		column.sourceKey === 'timeline_channel'
			? { ...column, channelId: channel.channelId, relays: channel.relays }
			: column
	);
}
