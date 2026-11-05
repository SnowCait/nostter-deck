/// <reference types="@wdio/mocha-framework" />
import { $, browser, expect } from '@wdio/globals';

describe('Windows desktop smoke test', () => {
	it('shows the initial screen and opens Settings', async () => {
		// Select the app window explicitly; service auto-focus requires the optional WDIO plugin.
		await browser.switchToWindow(await browser.getWindowHandle());

		const heading = await $('h1');
		await expect(heading).toBeDisplayed();
		await expect(heading.$('img')).toHaveAttribute('alt', 'nostter deck');

		await $('button[aria-label="Settings"]').click();
		const dialog = await $('[role="dialog"]');
		await expect(dialog).toBeDisplayed();
		await expect(dialog.$('h2')).toHaveText('Settings');
	});
});
