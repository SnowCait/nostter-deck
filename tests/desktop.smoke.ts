/// <reference types="@wdio/mocha-framework" />
/// <reference types="webdriverio" />
import { $, browser, expect } from '@wdio/globals';

describe('Windows desktop smoke test', () => {
	it('shows the initial screen and opens Settings', async () => {
		// Work around @wdio/tauri-service 1.5.1 repeatedly attempting
		// auto-focus recovery without the optional Tauri plugin.
		// Switching to the current window disables that recovery.
		await browser.switchToWindow(await browser.getWindowHandle());

		const heading = await $('h1');
		await expect(heading).toBeDisplayed();
		await expect(heading.$('img')).toHaveAttribute('alt', 'nostter deck');

		await $('button[aria-label="Settings"]').click();
		const dialog = await $('[role="dialog"]');
		await expect(dialog).toBeDisplayed();
		await expect(dialog.$('[role="heading"]')).toHaveText('Settings');
	});
});
