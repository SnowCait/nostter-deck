import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { readUserSettings, userSettingsStorageKey, writeUserSettings } from './user-settings';

function installLocalStorage() {
	const values = new Map<string, string>();

	vi.stubGlobal('localStorage', {
		getItem: vi.fn((key: string) => values.get(key) ?? null),
		setItem: vi.fn((key: string, value: string) => {
			values.set(key, value);
		})
	});

	return values;
}

describe('user settings storage', () => {
	let storageValues: Map<string, string>;

	beforeEach(() => {
		storageValues = installLocalStorage();
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	test('falls back when persisted settings are invalid', () => {
		storageValues.set(
			userSettingsStorageKey,
			JSON.stringify({ theme: 'sepia', fontSize: 'giant', avatarShape: 'triangle' })
		);

		expect(readUserSettings()).toEqual({
			theme: 'system',
			fontSize: 'medium',
			avatarShape: 'circle'
		});
	});

	test('preserves valid persisted settings', () => {
		writeUserSettings({ theme: 'dark', fontSize: 'large', avatarShape: 'square' });

		expect(readUserSettings()).toEqual({
			theme: 'dark',
			fontSize: 'large',
			avatarShape: 'square'
		});
	});
});
