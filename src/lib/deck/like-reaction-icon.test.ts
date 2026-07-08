import { describe, expect, test } from 'vitest';
import { getLikeReactionIcon } from './like-reaction-icon';

describe('like reaction icon', () => {
	test.each([
		[{ type: 'plus' } as const, 'heart'],
		[{ type: 'unicode', emoji: '🐾' } as const, 'paw'],
		[{ type: 'unicode', emoji: '⭐' } as const, 'star'],
		[{ type: 'unicode', emoji: '⭐️' } as const, 'star'],
		[{ type: 'unicode', emoji: '🔥' } as const, 'heart'],
		[
			{ type: 'custom', shortcode: 'blobcat', url: 'https://example.com/blobcat.png' } as const,
			'heart'
		]
	])('returns %s for %s', (reaction, icon) => {
		expect(getLikeReactionIcon(reaction)).toBe(icon);
	});
});
