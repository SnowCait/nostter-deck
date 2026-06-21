import { readJsonStorage, writeJsonStorage } from '$lib/local-storage';

export const themePreferences = ['system', 'light', 'dark'] as const;
export const fontSizePreferences = ['large', 'medium', 'small'] as const;
export const avatarShapePreferences = ['circle', 'square'] as const;

export type ThemePreference = (typeof themePreferences)[number];
export type FontSize = (typeof fontSizePreferences)[number];
export type AvatarShape = (typeof avatarShapePreferences)[number];

export type UserSettings = {
	theme: ThemePreference;
	fontSize: FontSize;
	avatarShape: AvatarShape;
	includeClientTag: boolean;
};

const userSettingsStorageKey = 'nostter:user-settings';

const defaultUserSettings: UserSettings = {
	theme: 'system',
	fontSize: 'medium',
	avatarShape: 'circle',
	includeClientTag: true
};

function isThemePreference(value: unknown): value is ThemePreference {
	return typeof value === 'string' && themePreferences.includes(value as ThemePreference);
}

function isFontSize(value: unknown): value is FontSize {
	return typeof value === 'string' && fontSizePreferences.includes(value as FontSize);
}

function isAvatarShape(value: unknown): value is AvatarShape {
	return typeof value === 'string' && avatarShapePreferences.includes(value as AvatarShape);
}

function normalizeUserSettings(value: unknown): UserSettings {
	if (!value || typeof value !== 'object') return { ...defaultUserSettings };

	const candidate = value as Partial<UserSettings>;
	return {
		theme: isThemePreference(candidate.theme) ? candidate.theme : defaultUserSettings.theme,
		fontSize: isFontSize(candidate.fontSize) ? candidate.fontSize : defaultUserSettings.fontSize,
		avatarShape: isAvatarShape(candidate.avatarShape)
			? candidate.avatarShape
			: defaultUserSettings.avatarShape,
		includeClientTag:
			typeof candidate.includeClientTag === 'boolean'
				? candidate.includeClientTag
				: defaultUserSettings.includeClientTag
	};
}

function shouldUseDarkTheme(theme: ThemePreference) {
	if (theme === 'dark') return true;
	if (theme === 'light') return false;

	return (
		typeof window !== 'undefined' &&
		window.matchMedia?.('(prefers-color-scheme: dark)').matches === true
	);
}

export function readUserSettings(): UserSettings {
	return readJsonStorage(userSettingsStorageKey, { ...defaultUserSettings }, normalizeUserSettings);
}

export function writeUserSettings(nextSettings: UserSettings) {
	writeJsonStorage(userSettingsStorageKey, nextSettings, normalizeUserSettings);
}

export function updateUserSettings(updater: (currentSettings: UserSettings) => UserSettings) {
	writeUserSettings(updater(readUserSettings()));
}

export function applyThemePreference(theme: ThemePreference = readUserSettings().theme) {
	if (typeof document === 'undefined') return;

	const isDark = shouldUseDarkTheme(theme);
	document.documentElement.classList.toggle('dark', isDark);
	document.documentElement.style.colorScheme = isDark ? 'dark' : 'light';
}

export function watchSystemThemePreference() {
	if (typeof window === 'undefined' || !window.matchMedia) return () => {};

	const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
	const handleChange = () => applyThemePreference();

	mediaQuery.addEventListener('change', handleChange);

	return () => {
		mediaQuery.removeEventListener('change', handleChange);
	};
}

export { userSettingsStorageKey };
