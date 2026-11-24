import { ChannelCreation, ChannelMetadata } from 'nostr-tools/kinds';
import { neventEncode, npubEncode } from 'nostr-tools/nip19';
import type * as Nostr from 'nostr-typedef';
import { describe, expect, test } from 'vitest';
import type { Profile } from '$lib/nostr/profiles';
import { applyChannelTitleEvent, getChannelTitleName, getColumnTitle } from './column-title';
import type { ChannelTitleMetadata } from './column-title';
import type { ColumnConfig } from './types';

const pubkey = 'a'.repeat(64);
const channelId = 'b'.repeat(64);
const column = {
	id: 'column',
	type: 'timeline',
	timelineKind: 'preset',
	width: 'standard'
} as const;
const relays = { type: 'default' } as const;

function title(
	config: ColumnConfig,
	profile?: Profile,
	channelName?: string,
	locale: 'en' | 'ja' = 'en'
) {
	return getColumnTitle(
		config,
		locale,
		() => profile,
		() => channelName
	);
}

describe('column titles', () => {
	test.each([
		['timeline_follow', 'Follow'],
		['nav_notifications', 'Notifications']
	] as const)(
		'uses profile metadata for %s and shows a shortened npub when unavailable',
		(sourceKey, label) => {
			const config = { ...column, sourceKey, pubkey, relays, includeOwnEvents: false };
			expect(title(config)).toBe(`${label}: ${npubEncode(pubkey).slice(0, 12)}`);
			expect(title(config, { name: 'Alice', customEmojis: [] })).toBe(`${label}: Alice`);
			expect(title(config, { display_name: 'Alicia', name: 'Alice', customEmojis: [] })).toBe(
				`${label}: Alicia`
			);
		}
	);

	test('localizes the label and trims a search query', () => {
		const config = { ...column, sourceKey: 'timeline_search', query: '  nostr  ' } as const;
		expect(title(config)).toBe('Search: nostr');
		expect(title(config, undefined, undefined, 'ja')).toBe('検索: nostr');
	});

	test('prefers a custom title and resumes the current channel title when cleared', () => {
		const config = { ...column, sourceKey: 'timeline_channel', channelId, relays } as const;
		expect(title(config)).toBe(`Channel: ${neventEncode({ id: channelId }).slice(0, 17)}`);
		expect(title({ ...config, title: 'Pinned title' }, undefined, 'Renamed')).toBe('Pinned title');
		expect(title({ ...config, title: '' }, undefined, 'Renamed')).toBe('Channel: Renamed');
	});

	test('keeps the custom timeline label and website hostname defaults', () => {
		expect(title({ ...column, timelineKind: 'custom', filters: [], relays })).toBe(
			'Custom timeline'
		);
		expect(
			title({ id: 'website', type: 'website', width: 'standard', url: 'https://example.com/path' })
		).toBe('example.com');
	});
});

function channelEvent(fields: Partial<Nostr.Event>): Nostr.Event {
	return {
		kind: ChannelMetadata,
		id: 'c'.repeat(64),
		pubkey,
		created_at: 2,
		tags: [['e', channelId, '', 'root']],
		content: '{"name":"New name"}',
		sig: '',
		...fields
	};
}

describe('channel title metadata', () => {
	test('uses the creation name until valid metadata from the channel creator is known', () => {
		let metadata: ChannelTitleMetadata = { updates: new Map() };
		const apply = (event: Nostr.Event) => {
			metadata = applyChannelTitleEvent(channelId, metadata, event);
		};

		apply(channelEvent({ pubkey: 'd'.repeat(64), created_at: 5, content: '{"name":"Impostor"}' }));
		expect(getChannelTitleName(metadata)).toBeUndefined();
		apply(channelEvent({ kind: ChannelCreation, id: channelId, content: '{"name":"Original"}' }));
		apply(channelEvent({ tags: [['e', 'e'.repeat(64)]] }));
		apply(channelEvent({ tags: [['e', channelId, '', 'reply']] }));
		apply(channelEvent({ content: 'invalid JSON' }));
		apply(channelEvent({ content: '{"name":"  "}' }));
		expect(getChannelTitleName(metadata)).toBe('Original');

		apply(channelEvent({ tags: [['e', channelId]] }));
		apply(channelEvent({ created_at: 1, content: '{"name":"Older"}' }));
		apply(channelEvent({ created_at: 3, content: '{"name":42}' }));
		expect(getChannelTitleName(metadata)).toBe('New name');
		apply(channelEvent({ created_at: 4, content: '{"name":" Latest "}' }));
		expect(getChannelTitleName(metadata)).toBe('Latest');
	});

	test('retains a valid update received before creation and ignores unrelated creation events', () => {
		const update = applyChannelTitleEvent(channelId, { updates: new Map() }, channelEvent({}));
		const unrelated = channelEvent({ kind: ChannelCreation });
		expect(
			getChannelTitleName(applyChannelTitleEvent(channelId, update, unrelated))
		).toBeUndefined();
		const creation = channelEvent({ kind: ChannelCreation, id: channelId, content: '{}' });
		expect(getChannelTitleName(applyChannelTitleEvent(channelId, update, creation))).toBe(
			'New name'
		);
	});
});
