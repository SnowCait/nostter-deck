import { describe, expect, test } from 'vitest';
import { Repost, ShortTextNote } from 'nostr-tools/kinds';
import type * as Nostr from 'nostr-typedef';
import { emptyTimelineRuntime } from './timeline-runtime';
import { addProfilePostEvent } from './profile-post-runtime';

function event(id: string, createdAt: number, kind = ShortTextNote, tags: string[][] = []) {
	return {
		id,
		pubkey: 'a'.repeat(64),
		created_at: createdAt,
		kind,
		tags,
		content: '',
		sig: '0'.repeat(128)
	} satisfies Nostr.Event;
}

describe('profile post runtime', () => {
	test('keeps independent posts and reposts while excluding replies', () => {
		const post = event('1'.repeat(64), 100);
		const reply = event('2'.repeat(64), 300, ShortTextNote, [['e', 'f'.repeat(64), '', 'reply']]);
		const repost = event('3'.repeat(64), 200, Repost);

		const runtime = [post, reply, repost].reduce(addProfilePostEvent, emptyTimelineRuntime());

		expect(runtime.visibleEventIds).toEqual([repost.id, post.id]);
	});

	test('deduplicates without trimming previously received posts', () => {
		const events = Array.from({ length: 25 }, (_, index) =>
			event(index.toString(16).padStart(64, '0'), index)
		);
		const runtime = [...events, events[0]].reduce(addProfilePostEvent, emptyTimelineRuntime());

		expect(runtime.visibleEventIds).toHaveLength(25);
		expect(runtime.visibleEventIds[0]).toBe(events.at(-1)?.id);
	});
});
