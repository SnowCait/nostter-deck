import type { ColumnConfig, ColumnSourceKey, NostrFilter, RelaySelection } from './types';
import type { ChannelPointer, ProfilePointer } from '$lib/nostr/nip19';
import { combineRelays, defaultRelays } from '$lib/nostr/relays';

export type AddColumnType = ColumnSourceKey | 'custom_timeline' | 'website';

export type AddColumnDraft = {
	id: string;
	columnType: AddColumnType;
	websiteUrl: string | null;
	followTarget: ProfilePointer | null;
	searchQuery: string;
	channelTarget: ChannelPointer | null;
	presetTimelineRelays: RelaySelection | null;
	customTimelineFilters: NostrFilter[] | null;
	customTimelineRelays: RelaySelection | null;
};

function getPointerRelaySelection(relays: string[]): RelaySelection {
	return relays.length > 0
		? { type: 'custom', urls: combineRelays([...defaultRelays], relays) }
		: { type: 'default' };
}

function getFollowRelaySelection(profile: ProfilePointer): RelaySelection {
	return { type: 'nip65', pubkey: profile.pubkey };
}

export function createColumnConfigFromDraft(draft: AddColumnDraft): ColumnConfig | null {
	if (draft.columnType === 'website') {
		return draft.websiteUrl
			? {
					id: draft.id,
					type: 'website',
					url: draft.websiteUrl,
					width: 'standard'
				}
			: null;
	}

	if (draft.columnType === 'custom_timeline') {
		return draft.customTimelineFilters && draft.customTimelineRelays
			? {
					id: draft.id,
					type: 'timeline',
					timelineKind: 'custom',
					filters: draft.customTimelineFilters,
					relays: draft.customTimelineRelays,
					width: 'standard'
				}
			: null;
	}

	if (draft.columnType === 'timeline_follow') {
		return draft.followTarget
			? {
					id: draft.id,
					type: 'timeline',
					timelineKind: 'preset',
					sourceKey: draft.columnType,
					pubkey: draft.followTarget.pubkey,
					relays: draft.presetTimelineRelays ?? getFollowRelaySelection(draft.followTarget),
					width: 'standard'
				}
			: null;
	}

	if (draft.columnType === 'timeline_search') {
		const query = draft.searchQuery.trim();
		return query
			? {
					id: draft.id,
					type: 'timeline',
					timelineKind: 'preset',
					sourceKey: draft.columnType,
					query,
					width: 'standard'
				}
			: null;
	}

	if (draft.columnType === 'timeline_channel') {
		return draft.channelTarget
			? {
					id: draft.id,
					type: 'timeline',
					timelineKind: 'preset',
					sourceKey: draft.columnType,
					channelId: draft.channelTarget.channelId,
					relays:
						draft.presetTimelineRelays ?? getPointerRelaySelection(draft.channelTarget.relays),
					width: 'standard'
				}
			: null;
	}

	return null;
}
