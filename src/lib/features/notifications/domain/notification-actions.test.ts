import { describe, expect, test } from 'vitest';
import { neventEncode, nprofileEncode, npubEncode } from 'nostr-tools/nip19';
import type * as Nostr from 'nostr-typedef';
import { classifyNotification, parseNotificationTarget } from './notification-actions';

const target = 'a'.repeat(64);
const other = 'b'.repeat(64);
const reference = 'c'.repeat(64);
const targetTag = ['p', target];

function event(fields: Partial<Nostr.Event> = {}): Nostr.Event {
	return {
		id: 'd'.repeat(64),
		pubkey: other,
		kind: 1,
		content: '',
		tags: [targetTag],
		created_at: 0,
		sig: '',
		...fields
	};
}

function types(source: Nostr.Event, related?: Nostr.Event, includeOwnEvents = false) {
	return classifyNotification(source, target, includeOwnEvents, (id) =>
		id === related?.id ? related : undefined
	).types;
}

describe('notification classification', () => {
	test('requires an npub for column targets', () => {
		expect(parseNotificationTarget(` ${npubEncode(target)} `)).toBe(target);
		expect(parseNotificationTarget(nprofileEncode({ pubkey: target }))).toBeNull();
		expect(parseNotificationTarget(target)).toBeNull();
		expect(parseNotificationTarget('npub1invalid')).toBeNull();
	});

	test('requires the target p tag and excludes unsupported or unclassified events', () => {
		expect(types(event({ content: `nostr:${npubEncode(target)}`, tags: [['p', other]] }))).toEqual(
			[]
		);
		expect(types(event({ kind: 16, tags: [targetTag, ['e', reference]] }))).toEqual([]);
		expect(types(event())).toEqual([]);
		expect(types(event({ kind: 7 }))).toEqual([]);
	});

	test('classifies inherited p tags as replies even when the parent has another author', () => {
		const reply = event({ tags: [['e', reference, '', 'reply'], ['p', other], targetTag] });
		expect(types(reply, event({ id: reference }))).toEqual(['reply']);
		expect(types(event({ tags: [targetTag, ['e', reference, '', 'mention']] }))).toEqual([]);
	});

	test.each([npubEncode(target), nprofileEncode({ pubkey: target })])(
		'recognizes explicit NIP-27 references',
		(pointer) => {
			expect(types(event({ content: `Hello nostr:${pointer}!` }))).toEqual(['mention']);
		}
	);

	test('never classifies legacy mentions or content-only event references as quotes', () => {
		expect(types(event({ content: '#[0]' }))).toEqual([]);
		expect(types(event({ content: `nostr:${neventEncode({ id: reference })}` }))).toEqual([]);
		expect(types(event({ tags: [targetTag, ['q', reference]] }))).toEqual(['quote']);
	});

	test.each([
		[1, 'q', 'quote'],
		[6, 'e', 'repost'],
		[7, 'e', 'reaction']
	] as const)(
		'classifies kind %i provisionally and rechecks it when the reference is available',
		(kind, tag, type) => {
			const source = event({ kind, tags: [targetTag, [tag, reference]] });
			expect(types(source)).toEqual([type]);
			expect(types(source, event({ id: reference, pubkey: target }))).toEqual([type]);
			expect(types(source, event({ id: reference, pubkey: other }))).toEqual([]);
		}
	);

	test('returns all applicable types and deduplicates repeated references', () => {
		const multi = event({
			content: `nostr:${npubEncode(target)}`,
			tags: [targetTag, ['e', reference, '', 'reply'], ['q', reference], ['q', reference]]
		});
		expect(classifyNotification(multi, target, false, () => undefined)).toEqual({
			types: ['reply', 'mention', 'quote'],
			relatedEventIds: [reference]
		});
		expect(types(multi, event({ id: reference, pubkey: other }))).toEqual(['reply', 'mention']);
	});

	test('includes own events only when enabled and still requires a notification type', () => {
		const own = event({ pubkey: target, tags: [targetTag, ['q', reference]] });
		expect(types(own)).toEqual([]);
		expect(types(own, undefined, true)).toEqual(['quote']);
		expect(types(event({ pubkey: target }), undefined, true)).toEqual([]);
	});
});
