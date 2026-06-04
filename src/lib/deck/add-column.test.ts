import { describe, expect, test } from 'vitest';
import { createColumnConfigFromDraft, type AddColumnDraft } from './add-column';

const baseDraft: AddColumnDraft = {
	id: 'column-1',
	columnType: 'website',
	websiteUrl: null,
	followTarget: null,
	searchQuery: '',
	customTimelineFilters: null,
	customTimelineRelays: null
};

describe('column config drafts', () => {
	test('creates a website column config', () => {
		expect(
			createColumnConfigFromDraft({
				...baseDraft,
				columnType: 'website',
				websiteUrl: 'https://example.com/'
			})
		).toEqual({
			id: 'column-1',
			type: 'website',
			url: 'https://example.com/',
			width: 'standard'
		});
	});

	test('creates a follow column config', () => {
		expect(
			createColumnConfigFromDraft({
				...baseDraft,
				columnType: 'timeline_follow',
				followTarget: { pubkey: 'a'.repeat(64), relays: ['wss://relay.example/'] }
			})
		).toEqual({
			id: 'column-1',
			type: 'timeline',
			timelineKind: 'preset',
			sourceKey: 'timeline_follow',
			pubkey: 'a'.repeat(64),
			relays: ['wss://relay.example/'],
			width: 'standard'
		});
	});

	test('creates a search column config with a trimmed query', () => {
		expect(
			createColumnConfigFromDraft({
				...baseDraft,
				columnType: 'timeline_search',
				searchQuery: ' nostter '
			})
		).toEqual({
			id: 'column-1',
			type: 'timeline',
			timelineKind: 'preset',
			sourceKey: 'timeline_search',
			query: 'nostter',
			width: 'standard'
		});
	});

	test('creates a custom timeline column config', () => {
		expect(
			createColumnConfigFromDraft({
				...baseDraft,
				columnType: 'custom_timeline',
				customTimelineFilters: [{ kinds: [1], limit: 20 }],
				customTimelineRelays: { type: 'default' }
			})
		).toEqual({
			id: 'column-1',
			type: 'timeline',
			timelineKind: 'custom',
			filters: [{ kinds: [1], limit: 20 }],
			relays: { type: 'default' },
			width: 'standard'
		});
	});

	test.each([
		{ columnType: 'website' as const },
		{ columnType: 'timeline_follow' as const },
		{ columnType: 'timeline_search' as const, searchQuery: '   ' },
		{ columnType: 'custom_timeline' as const }
	])('returns null when required draft data is missing for $columnType', (draft) => {
		expect(createColumnConfigFromDraft({ ...baseDraft, ...draft })).toBeNull();
	});
});
