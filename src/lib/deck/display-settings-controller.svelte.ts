import {
	readUserSettings,
	updateUserSettings,
	type AvatarShape,
	type FontSize,
	type PostActionVisibility,
	type ThemePreference
} from '$lib/user-settings';

export function createDisplaySettingsController() {
	function updateSetting(update: Parameters<typeof updateUserSettings>[0]) {
		updateUserSettings(update);
	}

	function updateTheme(nextTheme: ThemePreference) {
		updateSetting((settings) => ({ ...settings, theme: nextTheme }));
	}

	function updateFontSize(nextFontSize: FontSize) {
		updateSetting((settings) => ({ ...settings, fontSize: nextFontSize }));
	}

	function updateAvatarShape(nextAvatarShape: AvatarShape) {
		updateSetting((settings) => ({ ...settings, avatarShape: nextAvatarShape }));
	}

	function updatePostActionVisibility(nextVisibility: PostActionVisibility) {
		updateSetting((settings) => ({ ...settings, postActionVisibility: nextVisibility }));
	}

	function updateIncludeClientTag(includeClientTag: boolean) {
		updateSetting((settings) => ({ ...settings, includeClientTag }));
	}

	return {
		get theme() {
			return readUserSettings().theme;
		},
		get fontSize() {
			return readUserSettings().fontSize;
		},
		get avatarShape() {
			return readUserSettings().avatarShape;
		},
		get postActionVisibility() {
			return readUserSettings().postActionVisibility;
		},
		get includeClientTag() {
			return readUserSettings().includeClientTag;
		},
		updateTheme,
		updateFontSize,
		updateAvatarShape,
		updatePostActionVisibility,
		updateIncludeClientTag
	};
}
