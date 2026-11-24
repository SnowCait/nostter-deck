import { expect, test } from 'vitest';
import { createAbsoluteTimestampFormatter, formatRelativeTimestamp } from './post-timestamp';

test('adds the date at local midnight and the year at the new year', () => {
	const format = createAbsoluteTimestampFormatter('en-GB');
	const post = new Date(2026, 11, 30, 23, 59, 58);

	expect(format(post, new Date(2026, 11, 30, 23, 59, 59).getTime())).toBe('23:59');
	expect(format(post, new Date(2026, 11, 31).getTime())).toMatch(/^30\/12.*23:59$/);
	expect(format(post, new Date(2027, 0, 1).getTime())).toMatch(/^30\/12\/2026.*23:59$/);
});

test('uses the selected language for date ordering', () => {
	const post = new Date(2025, 6, 9, 10, 20);
	const now = new Date(2026, 0, 1).getTime();
	expect(createAbsoluteTimestampFormatter('ja')(post, now)).toMatch(/^2025\/7\/9.*10:20$/);
	expect(createAbsoluteTimestampFormatter('en-US')(post, now)).toMatch(/^7\/9\/2025.*10:20/);
});

test.each([
	[-1, '0s'],
	[0, '0s'],
	[59.99, '59s'],
	[60, '1m'],
	[3599, '59m'],
	[3600, '1h'],
	[86399, '23h'],
	[86400, '1d'],
	[172799, '1d']
])('formats elapsed %s seconds with whole units', (seconds, expected) => {
	const now = 2_000_000_000_000;
	const post = new Date(now - seconds * 1000);
	expect(formatRelativeTimestamp(post, now)).toBe(expected);
});
