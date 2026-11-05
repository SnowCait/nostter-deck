/// <reference types="@wdio/mocha-framework" />
import { $, expect } from '@wdio/globals';

describe('Windows desktop smoke test', () => {
	it('shows the initial screen and opens Settings', async () => {
		const heading = await $('h1');
		await expect(heading).toBeDisplayed();
		await expect(heading.$('img')).toHaveAttribute('alt', 'nostter deck');

		await $('button[aria-label="Settings"]').click();
		const dialog = await $('[role="dialog"]');
		await expect(dialog).toBeDisplayed();
		await expect(dialog.$('h2')).toHaveText('Settings');
	});
});
