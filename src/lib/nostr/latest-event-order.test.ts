import { describe, expect, test } from 'vitest';
import type * as Nostr from 'nostr-typedef';
import {
	getLatestEventKey,
	isSupportedLatestEventKind,
	reduceLatestEvents
} from './latest-event-order';

function event(patch: Partial<Nostr.Event> = {}): Nostr.Event {
	return {
		id: 'b'.repeat(64),
		pubkey: 'a'.repeat(64),
		created_at: 100,
		kind: 0,
		tags: [],
		content: '',
		sig: '0'.repeat(128),
		...patch
	};
}

describe('latest event identity', () => {
	test('builds a normalized key for normal replaceable events', () => {
		const uppercasePubkey = 'ABCDEF'.repeat(10) + 'ABCD';

		expect(getLatestEventKey(event({ pubkey: uppercasePubkey, kind: 0 }))).toEqual([
			uppercasePubkey.toLowerCase(),
			0,
			''
		]);
		expect(getLatestEventKey(event({ kind: 3 }))).toEqual(['a'.repeat(64), 3, '']);
		expect(getLatestEventKey(event({ kind: 10002 }))).toEqual(['a'.repeat(64), 10002, '']);
	});

	test('uses the first usable d tag for addressable events', () => {
		const malformedAndDuplicateTags = [
			['d'],
			['d', 'development'],
			['d', 'ignored']
		] as Nostr.Event['tags'];

		expect(getLatestEventKey(event({ kind: 30000, tags: malformedAndDuplicateTags }))).toEqual([
			'a'.repeat(64),
			30000,
			'development'
		]);
	});

	test('allows an explicitly empty addressable identifier', () => {
		expect(getLatestEventKey(event({ kind: 30023, tags: [['d', '']] }))).toEqual([
			'a'.repeat(64),
			30023,
			''
		]);
	});

	test('rejects an addressable event without a usable d tag', () => {
		expect(() => getLatestEventKey(event({ kind: 30000, tags: [] }))).toThrow(
			'missing a usable d tag'
		);
	});

	test('rejects invalid pubkeys', () => {
		expect(() => getLatestEventKey(event({ pubkey: 'not-a-pubkey' }))).toThrow(
			'Invalid latest event pubkey'
		);
	});

	test.each([1, 20000, 40000, 10000.5, 30000.5, -1, 65536])(
		'rejects unsupported kind %s',
		(kind) => {
			expect(() => getLatestEventKey(event({ kind }))).toThrow(
				`Unsupported latest event kind: ${kind}`
			);
		}
	);

	test.each([0, 3, 10000, 19999, 30000, 39999])('accepts supported kind %s', (kind) => {
		expect(isSupportedLatestEventKind(kind)).toBe(true);
	});
});

describe('latest event batch reduction', () => {
	test.each([false, true])('retains one winner with reversed arrival order: %s', (reverse) => {
		const older = event({ id: '1'.repeat(64), created_at: 100 });
		const losingTie = event({ id: '3'.repeat(64), created_at: 200 });
		const winner = event({ id: '2'.repeat(64), created_at: 200 });

		const versions = [older, losingTie, winner];
		const ordered = reverse ? versions.toReversed() : versions;
		const duplicate = { ...winner, content: 'duplicate must not replace the winner' };

		expect(reduceLatestEvents([...ordered, duplicate]).map((candidate) => candidate.event)).toEqual(
			[winner]
		);
	});

	test('retains different kinds, pubkeys, and identifiers independently', () => {
		const events = [
			event({ kind: 0 }),
			event({ kind: 3 }),
			event({ pubkey: 'c'.repeat(64) }),
			event({ kind: 30000, tags: [['d', 'first']] }),
			event({ kind: 30000, tags: [['d', 'second']] })
		];

		expect(reduceLatestEvents(events).map((candidate) => candidate.key)).toEqual([
			['a'.repeat(64), 0, ''],
			['a'.repeat(64), 3, ''],
			['c'.repeat(64), 0, ''],
			['a'.repeat(64), 30000, 'first'],
			['a'.repeat(64), 30000, 'second']
		]);
	});
});
