import { describe, expect, test } from 'vitest';
import { ChannelCreation, ShortTextNote } from 'nostr-tools/kinds';
import { decode, neventEncode } from 'nostr-tools/nip19';
import type * as Nostr from 'nostr-typedef';
import {
	decodeChannelPointer,
	decodeEventPointer,
	encodeEventPointer,
	encodeNeventPointer
} from './nip19';

function event(patch: Partial<Nostr.Event> = {}): Nostr.Event {
	return {
		id: 'a'.repeat(64),
		pubkey: 'b'.repeat(64),
		created_at: 100,
		kind: ShortTextNote,
		tags: [],
		content: 'Event content',
		sig: '0'.repeat(128),
		...patch
	};
}

describe('nip19 pointers', () => {
	test('decodes hex event ids as event pointers', () => {
		expect(decodeEventPointer('A'.repeat(64))).toEqual({
			id: 'a'.repeat(64),
			relays: []
		});
	});

	test('decodes nevent pointers', () => {
		const encoded = neventEncode({
			id: 'b'.repeat(64),
			relays: ['wss://relay.example'],
			author: 'c'.repeat(64),
			kind: ChannelCreation
		});

		expect(decodeEventPointer(encoded)).toEqual({
			id: 'b'.repeat(64),
			relays: ['wss://relay.example/'],
			author: 'c'.repeat(64),
			kind: ChannelCreation
		});
	});

	test('decodes channel pointers from channel creation nevents', () => {
		const encoded = neventEncode({
			id: 'd'.repeat(64),
			relays: ['wss://relay.example'],
			kind: ChannelCreation
		});

		expect(decodeChannelPointer(encoded)).toEqual({
			channelId: 'd'.repeat(64),
			relays: ['wss://relay.example/']
		});
	});

	test('rejects non-channel nevents as channel pointers', () => {
		const encoded = neventEncode({
			id: 'e'.repeat(64),
			kind: ShortTextNote
		});

		expect(decodeChannelPointer(encoded)).toBeNull();
	});

	test('encodes regular events as nevent pointers without relay hints', () => {
		const pointer = encodeEventPointer(event());

		expect(pointer?.type).toBe('nevent');
		expect(decode(pointer?.value ?? '')).toEqual({
			type: 'nevent',
			data: {
				id: 'a'.repeat(64),
				relays: [],
				author: 'b'.repeat(64),
				kind: ShortTextNote
			}
		});
	});

	test('encodes nevent pointers with relay hints', () => {
		const pointer = encodeNeventPointer(event(), ['wss://relay.example/', '']);

		expect(decode(pointer ?? '')).toEqual({
			type: 'nevent',
			data: {
				id: 'a'.repeat(64),
				relays: ['wss://relay.example/'],
				author: 'b'.repeat(64),
				kind: ShortTextNote
			}
		});
	});

	test('encodes addressable events as nevent pointers when requested explicitly', () => {
		const pointer = encodeNeventPointer(
			event({
				kind: 30_023,
				tags: [['d', 'article']]
			})
		);

		expect(decode(pointer ?? '')).toMatchObject({
			type: 'nevent',
			data: {
				id: 'a'.repeat(64),
				author: 'b'.repeat(64),
				kind: 30_023
			}
		});
	});

	test.each(['article', ''])(
		'encodes addressable events with identifier %j as naddr pointers',
		(identifier) => {
			const pointer = encodeEventPointer(
				event({
					kind: 30_023,
					tags: [['d', identifier]]
				})
			);

			expect(pointer?.type).toBe('naddr');
			expect(decode(pointer?.value ?? '')).toEqual({
				type: 'naddr',
				data: {
					identifier,
					pubkey: 'b'.repeat(64),
					kind: 30_023,
					relays: []
				}
			});
		}
	);

	test.each([0, 3, 10_000])(
		'encodes replaceable kind %i as an naddr pointer with an empty identifier',
		(kind) => {
			const pointer = encodeEventPointer(
				event({
					kind,
					tags: [['d', 'ignored']]
				})
			);

			expect(pointer?.type).toBe('naddr');
			expect(decode(pointer?.value ?? '')).toEqual({
				type: 'naddr',
				data: {
					identifier: '',
					pubkey: 'b'.repeat(64),
					kind,
					relays: []
				}
			});
		}
	);

	test('uses nevent when an addressable event has no d tag', () => {
		expect(encodeEventPointer(event({ kind: 30_023 }))?.type).toBe('nevent');
	});

	test.each([{ id: 'invalid' }, { pubkey: 'invalid' }, { kind: -1 }, { kind: Number.NaN }])(
		'rejects invalid event pointers: %o',
		(patch) => {
			expect(encodeEventPointer(event(patch))).toBeNull();
			expect(encodeNeventPointer(event(patch))).toBeNull();
		}
	);
});
