import { describe, expect, test } from 'vitest';
import {
	saveChannelSettings,
	saveCustomTimelineSettings,
	saveFollowSettings,
	saveSearchSettings,
	updateColumnIcon,
	updateColumnTitle,
	updateColumnWidth
} from './column-updates';
import type { ColumnConfig } from './types';

const searchColumn = {
	id: 'search',
	type: 'timeline',
	timelineKind: 'preset',
	sourceKey: 'timeline_search',
	query: 'nostter',
	width: 'standard'
} satisfies ColumnConfig;

describe('column updates', () => {
	test('updates column width', () => {
		expect(updateColumnWidth([searchColumn], 'search', 'wide')).toEqual([
			{ ...searchColumn, width: 'wide' }
		]);
	});

	test('updates and clears custom titles', () => {
		const titled = updateColumnTitle([searchColumn], 'search', '  My search  ');
		expect(titled).toEqual([{ ...searchColumn, title: 'My search' }]);
		expect(updateColumnTitle(titled, 'search', '   ')).toEqual([searchColumn]);
	});

	test('updates and clears custom icons', () => {
		const customized = updateColumnIcon([searchColumn], 'search', 'radio');
		expect(customized).toEqual([{ ...searchColumn, icon: 'radio' }]);
		expect(updateColumnIcon(customized, 'search', 'search')).toEqual([searchColumn]);
	});

	test('saves preset timeline settings', () => {
		expect(
			saveFollowSettings(
				[
					{
						id: 'follow',
						type: 'timeline',
						timelineKind: 'preset',
						sourceKey: 'timeline_follow',
						pubkey: 'a'.repeat(64),
						relays: [],
						width: 'standard'
					}
				],
				'follow',
				{ pubkey: 'b'.repeat(64), relays: ['wss://relay.example/'] }
			)
		).toMatchObject([{ pubkey: 'b'.repeat(64), relays: ['wss://relay.example/'] }]);

		expect(saveSearchSettings([searchColumn], 'search', '  channel  ')).toEqual([
			{ ...searchColumn, query: 'channel' }
		]);
		expect(
			saveChannelSettings(
				[
					{
						id: 'channel',
						type: 'timeline',
						timelineKind: 'preset',
						sourceKey: 'timeline_channel',
						channelId: 'c'.repeat(64),
						relays: [],
						width: 'standard'
					}
				],
				'channel',
				{ channelId: 'd'.repeat(64), relays: ['wss://relay.example/'] }
			)
		).toMatchObject([{ channelId: 'd'.repeat(64), relays: ['wss://relay.example/'] }]);
	});

	test('saves custom timeline settings', () => {
		expect(
			saveCustomTimelineSettings(
				[
					{
						id: 'custom',
						type: 'timeline',
						timelineKind: 'custom',
						filters: [{ kinds: [1] }],
						relays: { type: 'default' },
						width: 'standard'
					}
				],
				'custom',
				[{ kinds: [42] }],
				{ type: 'custom', urls: ['wss://relay.example/'] }
			)
		).toMatchObject([
			{ filters: [{ kinds: [42] }], relays: { type: 'custom', urls: ['wss://relay.example/'] } }
		]);
	});
});
