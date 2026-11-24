import { beforeEach, describe, expect, test } from 'vitest';
import { normalizeUserSettings, readUserSettings, updateUserSettings } from './user-settings';

describe('user settings storage', () => {
	beforeEach(() => {
		updateUserSettings(() => ({
			theme: 'system',
			fontSize: 'medium',
			avatarShape: 'circle',
			includeClientTag: true,
			postActionVisibility: 'onInteraction',
			postTimestampMode: 'absolute'
		}));
	});

	test('falls back when persisted settings are invalid', () => {
		expect(
			normalizeUserSettings({ theme: 'sepia', fontSize: 'giant', avatarShape: 'triangle' })
		).toEqual({
			theme: 'system',
			fontSize: 'medium',
			avatarShape: 'circle',
			includeClientTag: true,
			postActionVisibility: 'onInteraction',
			postTimestampMode: 'absolute'
		});
	});

	test('preserves valid persisted settings', () => {
		updateUserSettings(() => ({
			theme: 'dark',
			fontSize: 'large',
			avatarShape: 'square',
			includeClientTag: false,
			postActionVisibility: 'always',
			postTimestampMode: 'relative'
		}));

		expect(readUserSettings()).toEqual({
			theme: 'dark',
			fontSize: 'large',
			avatarShape: 'square',
			includeClientTag: false,
			postActionVisibility: 'always',
			postTimestampMode: 'relative'
		});
	});

	test('enables client information for settings saved before the preference existed', () => {
		expect(
			normalizeUserSettings({ theme: 'light', fontSize: 'small', avatarShape: 'square' })
				.includeClientTag
		).toBe(true);
	});

	test('uses interaction visibility for settings saved before post action visibility existed', () => {
		expect(
			normalizeUserSettings({
				theme: 'light',
				fontSize: 'small',
				avatarShape: 'square',
				includeClientTag: false
			}).postActionVisibility
		).toBe('onInteraction');
	});
	test.each([undefined, 'invalid'])(
		'uses absolute timestamps for legacy or invalid preferences (%s)',
		(postTimestampMode) => {
			expect(normalizeUserSettings({ fontSize: 'large', postTimestampMode })).toMatchObject({
				fontSize: 'large',
				postTimestampMode: 'absolute'
			});
		}
	);
});
