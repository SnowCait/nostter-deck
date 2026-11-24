import { ChannelCreation, ChannelMetadata } from 'nostr-tools/kinds';
import type * as Nostr from 'nostr-typedef';
import { getProfileDisplayName, type Profile } from '$lib/nostr/profiles';
import { m } from '$lib/paraglide/messages.js';
import type { Locale } from '$lib/paraglide/runtime.js';
import type { ColumnConfig } from './types';
import { getWebsiteHostname } from './website-url';

export function getColumnTitle(
	column: ColumnConfig,
	locale: Locale,
	getProfile: (pubkey: string) => Profile | undefined,
	getChannelName: (channelId: string) => string | undefined
) {
	const customTitle = column.title?.trim();
	if (customTitle) {
		return customTitle;
	}
	if (column.type === 'website') {
		return getWebsiteHostname(column.url);
	}
	if (column.timelineKind === 'custom') {
		return m.column_type_custom_timeline({}, { locale });
	}

	const label = m[column.sourceKey]({}, { locale });
	switch (column.sourceKey) {
		case 'timeline_follow':
		case 'nav_notifications':
		case 'timeline_user_posts':
			return `${label}: ${getProfileDisplayName(getProfile(column.pubkey), column.pubkey)}`;
		case 'timeline_search':
			return `${label}: ${column.query.trim()}`;
		case 'timeline_channel':
			return `${label}: ${getChannelName(column.channelId) ?? column.channelId.slice(0, 12)}`;
	}
}

type ChannelName = { name: string; event: Nostr.Event };
export type ChannelTitleMetadata = {
	creation?: Nostr.Event;
	updates: ReadonlyMap<string, ChannelName>;
};

export function applyChannelTitleEvent(
	channelId: string,
	metadata: ChannelTitleMetadata,
	event: Nostr.Event
): ChannelTitleMetadata {
	if (event.kind === ChannelCreation && event.id === channelId && !metadata.creation) {
		const update = metadata.updates.get(event.pubkey);
		return {
			creation: event,
			updates: new Map(update ? [[event.pubkey, update]] : [])
		};
	}

	if (
		event.kind !== ChannelMetadata ||
		(metadata.creation && metadata.creation.pubkey !== event.pubkey) ||
		!referencesChannel(event, channelId)
	) {
		return metadata;
	}

	const name = readChannelName(event.content);
	if (!name) {
		return metadata;
	}

	const previous = metadata.updates.get(event.pubkey)?.event;
	if (
		previous &&
		(previous.created_at > event.created_at ||
			(previous.created_at === event.created_at && previous.id <= event.id))
	) {
		return metadata;
	}

	return { ...metadata, updates: new Map(metadata.updates).set(event.pubkey, { name, event }) };
}

export function getChannelTitleName(metadata: ChannelTitleMetadata) {
	const creation = metadata.creation;
	if (!creation) {
		return undefined;
	}

	return metadata.updates.get(creation.pubkey)?.name ?? readChannelName(creation.content);
}

function referencesChannel(event: Nostr.Event, channelId: string) {
	const references = event.tags.filter(([name]) => name === 'e');
	const root = references.find((tag) => tag[3] === 'root');
	return root ? root[1] === channelId : references.some((tag) => tag[1] === channelId && !tag[3]);
}

function readChannelName(content: string): string | undefined {
	try {
		const value = JSON.parse(content);
		return typeof value?.name === 'string' ? value.name.trim() || undefined : undefined;
	} catch {
		return undefined;
	}
}
