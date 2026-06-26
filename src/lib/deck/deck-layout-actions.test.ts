import { describe, expect, test } from 'vitest';
import { getEffectiveDeckLayoutMode, resolveSingleColumnId } from './deck-layout-actions';

const columns = [{ id: 'first' }, { id: 'second' }, { id: 'third' }];

describe('deck layout actions', () => {
	test('resolves the effective layout mode', () => {
		expect(getEffectiveDeckLayoutMode('auto', false)).toBe('deck');
		expect(getEffectiveDeckLayoutMode('auto', true)).toBe('single');
		expect(getEffectiveDeckLayoutMode('deck', true)).toBe('deck');
		expect(getEffectiveDeckLayoutMode('single', false)).toBe('single');
	});

	test('keeps a valid preferred single column', () => {
		expect(resolveSingleColumnId(columns, 'second')).toBe('second');
	});

	test('falls back to the first column when the preferred column is missing', () => {
		expect(resolveSingleColumnId(columns, 'missing')).toBe('first');
		expect(resolveSingleColumnId([], 'missing')).toBe('');
	});
});
