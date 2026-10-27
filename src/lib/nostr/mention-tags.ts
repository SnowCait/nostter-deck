import { decodeProfilePointer } from './nip19';
import { normalizePubkey } from './pubkeys';

const mentionReferencePattern = /nostr:((?:npub|nprofile)1[02-9ac-hj-np-z]+)/gi;

export function* matchMentionReferences(content: string) {
	for (const match of content.matchAll(mentionReferencePattern)) {
		const pointer = decodeProfilePointer(match[1]);
		if (pointer) {
			const start = match.index ?? 0;
			yield { start, end: start + match[0].length, pubkey: pointer.pubkey };
		}
	}
}

export function extractMentionPubkeys(content: string) {
	const pubkeys: string[] = [];
	for (const reference of matchMentionReferences(content)) {
		if (!pubkeys.includes(reference.pubkey)) {
			pubkeys.push(reference.pubkey);
		}
	}
	return pubkeys;
}

export function addContentMentionTags(tags: string[][], content: string) {
	const taggedPubkeys = new Set(
		tags.flatMap((tag) => {
			const pubkey = tag[0] === 'p' ? normalizePubkey(tag[1]) : null;
			return pubkey ? [pubkey] : [];
		})
	);
	const nextTags = [...tags];
	for (const pubkey of extractMentionPubkeys(content)) {
		if (taggedPubkeys.has(pubkey)) {
			continue;
		}
		taggedPubkeys.add(pubkey);
		nextTags.push(['p', pubkey]);
	}
	return nextTags;
}
