import { nprofileEncode, npubEncode } from 'nostr-tools/nip19';
import { describe, expect, test } from 'vitest';
import {
	addContentMentionTags,
	applyMentionSelection,
	createMentionCandidates,
	extractMentionPubkeys,
	getActiveMentionQuery,
	hydrateCanonicalMentions,
	reconcileMentionRanges,
	searchMentionCandidates,
	serializeMentionText,
	type MentionCandidate
} from './mention-actions';

const alice = 'a'.repeat(64);
const bob = 'b'.repeat(64);
const carol = 'c'.repeat(64);

function candidate(patch: Partial<MentionCandidate> = {}): MentionCandidate {
	return {
		pubkey: alice,
		displayName: 'Alice',
		npub: npubEncode(alice),
		nip05: 'alice@example.com',
		searchNames: ['Alice', 'alice@example.com', npubEncode(alice)],
		isFollowing: true,
		hasProfile: true,
		...patch
	};
}

describe('mention candidates', () => {
	test('builds a deduplicated union of followed pubkeys and cached profiles', () => {
		const candidates = createMentionCandidates(
			[
				{
					pubkey: alice,
					profile: { display_name: '  @Alice\nRelay ', name: 'alice', nip05: 'alice@example.com' }
				},
				{ pubkey: carol, profile: { name: 'Carol' } }
			],
			[alice.toUpperCase(), bob, bob]
		);

		expect(candidates).toHaveLength(3);
		expect(candidates.find((value) => value.pubkey === alice)).toMatchObject({
			displayName: 'Alice Relay',
			isFollowing: true,
			hasProfile: true
		});
		expect(candidates.find((value) => value.pubkey === bob)).toMatchObject({
			displayName: npubEncode(bob).slice(0, 12),
			isFollowing: true,
			hasProfile: false
		});
		expect(candidates.find((value) => value.pubkey === carol)).toMatchObject({
			displayName: 'Carol',
			isFollowing: false,
			hasProfile: true
		});
	});

	test('ranks prefix matches before partial matches and followed users within a rank', () => {
		const results = searchMentionCandidates(
			[
				candidate({
					pubkey: carol,
					displayName: 'Malice',
					searchNames: ['Malice'],
					isFollowing: true
				}),
				candidate({
					pubkey: bob,
					displayName: 'Alice B',
					searchNames: ['Alice B'],
					isFollowing: false
				}),
				candidate({
					pubkey: alice,
					displayName: 'Alice A',
					searchNames: ['Alice A'],
					isFollowing: true
				})
			],
			'ALI'
		);

		expect(results.map((value) => value.pubkey)).toEqual([alice, bob, carol]);
	});

	test('shows at most eight followed-first candidates for an empty query', () => {
		const candidates = Array.from({ length: 10 }, (_, index) =>
			candidate({
				pubkey: index.toString(16).padStart(64, '0'),
				displayName: `User ${index}`,
				searchNames: [`User ${index}`],
				isFollowing: index === 9
			})
		);
		const results = searchMentionCandidates(candidates, '');

		expect(results).toHaveLength(8);
		expect(results[0].pubkey).toBe('9'.padStart(64, '0'));
	});
});

describe('mention editing', () => {
	test('starts only at a valid boundary and excludes selections, emails, URLs, and tracked mentions', () => {
		expect(getActiveMentionQuery('@ali', 4, 4)).toEqual({ start: 0, end: 4, query: 'ali' });
		expect(getActiveMentionQuery('hello （@ali', 11, 11)).toEqual({
			start: 7,
			end: 11,
			query: 'ali'
		});
		expect(getActiveMentionQuery('mail@example.com', 16, 16)).toBeNull();
		expect(getActiveMentionQuery('https://example.com/@ali', 24, 24)).toBeNull();
		expect(getActiveMentionQuery('@ali', 1, 4)).toBeNull();
		expect(getActiveMentionQuery('@Alice', 6, 6, [{ start: 0, end: 6, pubkey: alice }])).toBeNull();
	});

	test('selects a candidate, serializes it, shifts it, and releases it on overlap', () => {
		const selected = applyMentionSelection(
			'Hello @ali',
			[],
			{ start: 6, end: 10, query: 'ali' },
			candidate()
		);
		expect(selected).toEqual({
			text: 'Hello @Alice ',
			mentions: [{ start: 6, end: 12, pubkey: alice }],
			caret: 13
		});
		expect(serializeMentionText(selected.text, selected.mentions)).toBe(
			`Hello nostr:${npubEncode(alice)} `
		);

		const shifted = reconcileMentionRanges(
			selected.text,
			`Say ${selected.text}`,
			selected.mentions
		);
		expect(shifted).toEqual([{ start: 10, end: 16, pubkey: alice }]);
		expect(reconcileMentionRanges(selected.text, 'Hello @Alce ', selected.mentions)).toEqual([]);
	});

	test('hydrates known npub and nprofile references while leaving unknown profiles intact', () => {
		const knownNpub = `nostr:${npubEncode(alice)}`;
		const knownNprofile = `nostr:${nprofileEncode({ pubkey: bob, relays: ['wss://relay.example/'] })}`;
		const unknownNpub = `nostr:${npubEncode(carol)}`;
		const hydrated = hydrateCanonicalMentions(
			`${knownNpub} and ${knownNprofile} and ${unknownNpub}`,
			[
				candidate(),
				candidate({
					pubkey: bob,
					displayName: 'Bob',
					npub: npubEncode(bob),
					searchNames: ['Bob']
				})
			]
		);

		expect(hydrated.text).toBe(`@Alice and @Bob and ${unknownNpub}`);
		expect(serializeMentionText(hydrated.text, hydrated.mentions)).toBe(
			`nostr:${npubEncode(alice)} and nostr:${npubEncode(bob)} and ${unknownNpub}`
		);
	});
});

describe('mention tags', () => {
	test('extracts npub and nprofile references and preserves existing richer p tags', () => {
		const content = [
			`nostr:${npubEncode(alice)}`,
			`nostr:${nprofileEncode({ pubkey: bob, relays: ['wss://relay.example/'] })}`,
			`nostr:${npubEncode(alice)}`
		].join(' ');

		expect(extractMentionPubkeys(content)).toEqual([alice, bob]);
		expect(addContentMentionTags([['p', alice, 'wss://existing.example/']], content)).toEqual([
			['p', alice, 'wss://existing.example/'],
			['p', bob]
		]);
	});

	test('ignores malformed and unsupported nostr references', () => {
		expect(addContentMentionTags([], 'nostr:npub1broken nostr:note1broken')).toEqual([]);
	});
});
