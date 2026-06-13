import type { FontSize } from '$lib/user-settings';

export type FontSizeTextClasses = {
	title: string;
	heading: string;
	control: string;
	label: string;
	account: string;
	meta: string;
	body: string;
	attachment: string;
	action: string;
	textarea: string;
	section: string;
};

export const textClassByFontSize = {
	small: {
		title: 'text-sm',
		heading: 'text-sm',
		control: 'text-xs',
		label: 'text-xs',
		account: 'text-xs',
		meta: 'text-[11px]',
		body: 'text-xs leading-5',
		attachment: 'text-xs leading-5',
		action: 'text-[11px]',
		textarea: 'text-sm leading-5',
		section: 'text-[11px]'
	},
	medium: {
		title: 'text-base',
		heading: 'text-base',
		control: 'text-sm',
		label: 'text-sm',
		account: 'text-sm',
		meta: 'text-xs',
		body: 'text-sm leading-5',
		attachment: 'text-sm leading-5',
		action: 'text-xs',
		textarea: 'text-base leading-6',
		section: 'text-xs'
	},
	large: {
		title: 'text-lg',
		heading: 'text-lg',
		control: 'text-base',
		label: 'text-base',
		account: 'text-base',
		meta: 'text-sm',
		body: 'text-base leading-6',
		attachment: 'text-base leading-6',
		action: 'text-sm',
		textarea: 'text-lg leading-7',
		section: 'text-sm'
	}
} satisfies Record<FontSize, FontSizeTextClasses>;
