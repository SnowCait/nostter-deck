import { describe, expect, test } from 'vitest';
import { ChannelCreation, ShortTextNote } from 'nostr-tools/kinds';
import { neventEncode } from 'nostr-tools/nip19';
import { decodeChannelPointer, decodeEventPointer } from './nip19';

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
});
