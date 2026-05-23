import type { AvatarShape } from '$lib/user-settings';

export const avatarShapeClassByShape = {
	circle: 'rounded-full',
	square: 'rounded-md'
} satisfies Record<AvatarShape, string>;
