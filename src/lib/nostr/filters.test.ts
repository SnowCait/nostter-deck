import { describe, expect, test } from 'vitest';
import { parseNostrFilters } from './filters';

const pubkey = 'a'.repeat(64);

describe('nostr filters', () => {
	test.each([['{"kinds":[1],"limit":20}'], ['[]'], ['[{"kinds":[1],"limit":20}, 1]']])(
		'rejects invalid filter JSON: %s',
		(draft) => {
			expect(parseNostrFilters(draft)).toBeNull();
		}
	);

	test('accepts a valid filter array', () => {
		expect(parseNostrFilters('[{"kinds":[1],"limit":20}]')).toEqual([{ kinds: [1], limit: 20 }]);
	});

	test('accepts address author filters', () => {
		expect(parseNostrFilters(`[{"kinds":[1],"authors":"30000:${pubkey}:favorites"}]`)).toEqual([
			{ kinds: [1], authors: `30000:${pubkey}:favorites` }
		]);
	});

	test('rejects malformed author filters', () => {
		expect(parseNostrFilters('[{"kinds":[1],"authors":"kind:pubkey:identifier"}]')).toBeNull();
	});
});
