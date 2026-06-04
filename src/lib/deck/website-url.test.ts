import { describe, expect, test } from 'vitest';
import { getWebsiteHostname, normalizeWebsiteUrl } from './website-url';

describe('website URL normalization', () => {
	test.each([
		['example.com', 'https://example.com/'],
		[' example.com/path ', 'https://example.com/path'],
		['https://example.com', 'https://example.com/']
	])('normalizes %s', (value, expected) => {
		expect(normalizeWebsiteUrl(value)).toBe(expected);
	});

	test.each(['', 'http://example.com', 'ws://example.com', 'not a url'])('rejects %s', (value) => {
		expect(normalizeWebsiteUrl(value)).toBeNull();
	});

	test('extracts hostnames and falls back to the original value', () => {
		expect(getWebsiteHostname('https://example.com/path')).toBe('example.com');
		expect(getWebsiteHostname('not a url')).toBe('not a url');
	});
});
