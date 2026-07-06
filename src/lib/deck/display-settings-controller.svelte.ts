import {
	readUserSettings,
	type AvatarShape,
	type FontSize,
	type PostActionVisibility
} from '$lib/user-settings';

export function createDisplaySettingsController() {
	const initialSettings = readUserSettings();
	let fontSize = $state<FontSize>(initialSettings.fontSize);
	let avatarShape = $state<AvatarShape>(initialSettings.avatarShape);
	let postActionVisibility = $state<PostActionVisibility>(initialSettings.postActionVisibility);

	function updateFontSize(nextFontSize: FontSize) {
		fontSize = nextFontSize;
	}

	function updateAvatarShape(nextAvatarShape: AvatarShape) {
		avatarShape = nextAvatarShape;
	}

	function updatePostActionVisibility(nextVisibility: PostActionVisibility) {
		postActionVisibility = nextVisibility;
	}

	return {
		get fontSize() {
			return fontSize;
		},
		get avatarShape() {
			return avatarShape;
		},
		get postActionVisibility() {
			return postActionVisibility;
		},
		updateFontSize,
		updateAvatarShape,
		updatePostActionVisibility
	};
}
