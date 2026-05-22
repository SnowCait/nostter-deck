export const themePreferences = ['system', 'light', 'dark'] as const;
export const fontSizePreferences = ['large', 'medium', 'small'] as const;

export type ThemePreference = (typeof themePreferences)[number];
export type FontSize = (typeof fontSizePreferences)[number];

export type UserSettings = {
	theme: ThemePreference;
	fontSize: FontSize;
};

const userSettingsStorageKey = 'nostter:user-settings';

const defaultUserSettings: UserSettings = {
	theme: 'system',
	fontSize: 'medium'
};

function canUseLocalStorage() {
	return typeof localStorage !== 'undefined';
}

function isThemePreference(value: unknown): value is ThemePreference {
	return typeof value === 'string' && themePreferences.includes(value as ThemePreference);
}

function isFontSize(value: unknown): value is FontSize {
	return typeof value === 'string' && fontSizePreferences.includes(value as FontSize);
}

function normalizeUserSettings(value: unknown): UserSettings {
	if (!value || typeof value !== 'object') return { ...defaultUserSettings };

	const candidate = value as Partial<UserSettings>;
	return {
		theme: isThemePreference(candidate.theme) ? candidate.theme : defaultUserSettings.theme,
		fontSize: isFontSize(candidate.fontSize) ? candidate.fontSize : defaultUserSettings.fontSize
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
	if (!canUseLocalStorage()) return { ...defaultUserSettings };

	try {
		const storedValue = localStorage.getItem(userSettingsStorageKey);
		if (!storedValue) return { ...defaultUserSettings };

		return normalizeUserSettings(JSON.parse(storedValue));
	} catch {
		return { ...defaultUserSettings };
	}
}

export function writeUserSettings(nextSettings: UserSettings) {
	if (!canUseLocalStorage()) return;

	localStorage.setItem(userSettingsStorageKey, JSON.stringify(normalizeUserSettings(nextSettings)));
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
