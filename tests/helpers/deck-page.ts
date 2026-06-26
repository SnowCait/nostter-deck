import { expect, type Locator, type Page } from '@playwright/test';
import { ShortTextNote } from 'nostr-tools/kinds';

export const columnNames: string[] = [];
export const sidebarButtonNames = ['Add column', 'Single column layout', 'Settings', 'Log in'];
export const sidebarExpandedWidth = 236;
export const sidebarCollapsedWidth = 60;
export const composerWidth = 360;
export const singleColumnMaxWidth = 640;
export const narrowColumnWidth = 280;
export const standardColumnWidth = 342;
export const wideColumnWidth = 480;
export const sidebarCenterTolerance = 1;
export const uiStateStorageKey = 'nostter:ui-state';
export const userSettingsStorageKey = 'nostter:user-settings';
export const columnConfigsStorageKey = 'nostter:column-configs';
export const columnDecksStorageKey = 'nostter:column-decks';
export const mutedUsersStorageKey = 'nostter:muted-users';
export const defaultRelaySelection = { type: 'default' };

const columnTypeLabels = {
	timeline_follow: 'Follow',
	timeline_search: 'Search',
	timeline_channel: 'Channel',
	custom_timeline: 'Custom timeline',
	website: 'Website'
} as const;

export type ColumnType = keyof typeof columnTypeLabels;

export async function openDeck(page: Page, options: { isLoggedIn?: boolean } = {}) {
	await page.addInitScript(({ isLoggedIn }) => {
		if (!window.localStorage.getItem('PARAGLIDE_LOCALE')) {
			window.localStorage.setItem('PARAGLIDE_LOCALE', 'en');
		}

		if (isLoggedIn) {
			Object.defineProperty(window, 'nostr', {
				configurable: true,
				value: {
					getPublicKey: async () =>
						'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
					signEvent: async (event: Record<string, unknown>) => ({
						...event,
						id: 'f'.repeat(64),
						pubkey: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
						sig: '0'.repeat(128)
					})
				}
			});
			const pubkey = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
			window.localStorage.setItem(
				'nostter:accounts',
				JSON.stringify({
					activeAccountId: `nip07:${pubkey}`,
					accounts: [
						{
							id: `nip07:${pubkey}`,
							method: 'nip07',
							pubkey,
							createdAt: 1
						}
					]
				})
			);
		}
	}, options);
	await page.goto('/');
}

export async function addPresetColumn(
	page: Page,
	sourceKey: 'timeline_follow' | 'timeline_search' | 'timeline_channel',
	options: { followTarget?: string; query?: string; channelTarget?: string } = {}
) {
	await page.getByRole('button', { name: 'Add column' }).first().click();
	await selectColumnType(page, sourceKey);
	if (sourceKey === 'timeline_follow') {
		await page.getByLabel('npub or nprofile').fill(options.followTarget ?? '');
	}
	if (sourceKey === 'timeline_search') {
		await page.getByLabel('Search query').fill(options.query ?? 'nostter');
	}
	if (sourceKey === 'timeline_channel') {
		await page.getByLabel('Channel ID or nevent').fill(options.channelTarget ?? '');
	}
	await page.getByRole('button', { name: 'Save' }).click();
}

export async function addWebsiteColumn(page: Page, url: string) {
	await page.getByRole('button', { name: 'Add column' }).first().click();
	await selectColumnType(page, 'website');
	await page.getByLabel('Website URL').fill(url);
	await page.getByRole('button', { name: 'Save' }).click();
}

export async function addCustomTimelineColumn(
	page: Page,
	options: { filters?: unknown; customRelays?: string } = {}
) {
	await page.getByRole('button', { name: 'Add column' }).first().click();
	await selectColumnType(page, 'custom_timeline');

	if (options.filters) {
		await page.getByLabel('REQ filters').fill(JSON.stringify(options.filters));
	}
	if (options.customRelays !== undefined) {
		await page.getByLabel('Custom relays').fill(options.customRelays);
	}

	await page
		.getByRole('dialog', { name: 'Add column' })
		.getByRole('button', { name: 'Save' })
		.click();
}

export async function selectColumnType(page: Page, columnType: ColumnType) {
	const radio = page.getByRole('radio', { name: columnTypeLabels[columnType], exact: true });
	await radio.locator('xpath=ancestor::label').click();
}

export async function selectDropdownOption(page: Page, trigger: Locator, optionLabel: string) {
	await trigger.click();
	await page.getByRole('option', { name: optionLabel, exact: true }).click();
}

export function deckColumns(page: Page) {
	return page.locator('section[id^="deck-column-"]');
}

export async function readStoredColumns(page: Page) {
	return page.evaluate(
		({ columnConfigsKey, columnDecksKey }) => {
			const legacyValue = window.localStorage.getItem(columnConfigsKey);
			if (legacyValue) return JSON.parse(legacyValue);

			const deckStoreValue = window.localStorage.getItem(columnDecksKey);
			if (!deckStoreValue) return null;

			const deckStore = JSON.parse(deckStoreValue);
			const decks = Array.isArray(deckStore.decks) ? deckStore.decks : [];
			const activeDeck =
				decks.find((deck: { id?: string }) => deck.id === deckStore.activeDeckId) ?? decks[0];
			return Array.isArray(activeDeck?.columns) ? activeDeck.columns : null;
		},
		{ columnConfigsKey: columnConfigsStorageKey, columnDecksKey: columnDecksStorageKey }
	);
}

export function columnOptionsButton(column: Locator) {
	return column.locator('header').getByRole('button', { name: 'Column options' });
}

export function sidebar(page: Page) {
	return page.locator('aside');
}

export function sidebarButton(page: Page, name: string) {
	return sidebar(page).getByRole('button', { name });
}

export function sidebarIconContainer(page: Page, name: string) {
	return sidebarButton(page, name).locator('span').first();
}

export function sidebarButtonIcon(page: Page, name: string) {
	return sidebarIconContainer(page, name).locator('svg');
}

export async function expectSidebarWidth(page: Page, width: number) {
	await expect
		.poll(async () => Math.round((await sidebar(page).boundingBox())?.width ?? 0))
		.toBe(width);
}

export async function expectStoredSidebarCollapsed(page: Page, value: boolean) {
	await expect
		.poll(async () =>
			page.evaluate((key) => {
				const storedValue = window.localStorage.getItem(key);
				return storedValue ? JSON.parse(storedValue).sidebarCollapsed : null;
			}, uiStateStorageKey)
		)
		.toBe(value);
}

export async function expectStoredDeckLayoutMode(page: Page, value: string) {
	await expect
		.poll(async () =>
			page.evaluate((key) => {
				const storedValue = window.localStorage.getItem(key);
				return storedValue ? JSON.parse(storedValue).deckLayoutMode : null;
			}, uiStateStorageKey)
		)
		.toBe(value);
}

export async function expectStoredThemePreference(page: Page, value: string) {
	await expect
		.poll(async () =>
			page.evaluate((key) => {
				const storedValue = window.localStorage.getItem(key);
				return storedValue ? JSON.parse(storedValue).theme : null;
			}, userSettingsStorageKey)
		)
		.toBe(value);
}

export async function expectStoredFontSize(page: Page, value: string) {
	await expect
		.poll(async () =>
			page.evaluate((key) => {
				const storedValue = window.localStorage.getItem(key);
				return storedValue ? JSON.parse(storedValue).fontSize : null;
			}, userSettingsStorageKey)
		)
		.toBe(value);
}

export async function expectStoredAvatarShape(page: Page, value: string) {
	await expect
		.poll(async () =>
			page.evaluate((key) => {
				const storedValue = window.localStorage.getItem(key);
				return storedValue ? JSON.parse(storedValue).avatarShape : null;
			}, userSettingsStorageKey)
		)
		.toBe(value);
}

export async function expectThemeNotStoredInUiState(page: Page) {
	await expect
		.poll(async () =>
			page.evaluate((key) => {
				const storedValue = window.localStorage.getItem(key);
				return storedValue ? Object.hasOwn(JSON.parse(storedValue), 'theme') : false;
			}, uiStateStorageKey)
		)
		.toBe(false);
}

export async function expectFontSizeNotStoredInUiState(page: Page) {
	await expect
		.poll(async () =>
			page.evaluate((key) => {
				const storedValue = window.localStorage.getItem(key);
				return storedValue ? Object.hasOwn(JSON.parse(storedValue), 'fontSize') : false;
			}, uiStateStorageKey)
		)
		.toBe(false);
}

export async function expectAvatarShapeNotStoredInUiState(page: Page) {
	await expect
		.poll(async () =>
			page.evaluate((key) => {
				const storedValue = window.localStorage.getItem(key);
				return storedValue ? Object.hasOwn(JSON.parse(storedValue), 'avatarShape') : false;
			}, uiStateStorageKey)
		)
		.toBe(false);
}

export async function fontSizePx(locator: Locator) {
	await expect(locator).toBeVisible();

	return Number.parseFloat(
		await locator.evaluate((element) => window.getComputedStyle(element).fontSize)
	);
}

export async function expectComposerNextToSidebar(page: Page, composer: Locator) {
	const sidebarBox = await requiredBox(sidebar(page), 'sidebar');
	const composerBox = await requiredBox(composer, 'composer');

	expect(Math.round(composerBox.width), 'composer should keep its lane width').toBe(composerWidth);
	expect(
		Math.abs(composerBox.x - (sidebarBox.x + sidebarBox.width)),
		'composer should sit directly next to the sidebar'
	).toBeLessThanOrEqual(sidebarCenterTolerance);
}

export async function expectAbove(upper: Locator, lower: Locator, label: string) {
	const upperBox = await requiredBox(upper, `${label} upper item`);
	const lowerBox = await requiredBox(lower, `${label} lower item`);

	expect(upperBox.y + upperBox.height, `${label} should be above`).toBeLessThanOrEqual(lowerBox.y);
}

export async function expectColumnOrder(columns: Locator, names: string[]) {
	await expect(columns).toHaveCount(names.length);
	await expect(columns.locator('header h2')).toHaveText(names);
}

export async function expectColumnWidth(column: Locator, width: number) {
	await expect.poll(async () => Math.round((await column.boundingBox())?.width ?? 0)).toBe(width);
}

export async function expectColumnMaxWidth(column: Locator, width: number) {
	await expect
		.poll(async () => Math.round((await column.boundingBox())?.width ?? 0))
		.toBeLessThanOrEqual(width);
}

export async function expectStoredColumnConfigWidths(page: Page, widths: string[]) {
	await expect
		.poll(
			async () =>
				(await readStoredColumns(page))?.map((column: { width: string }) => column.width) ?? null
		)
		.toEqual(widths);
}

export async function expectStoredColumnIdsAreOpaque(page: Page) {
	await expect
		.poll(async () => {
			const columns = await readStoredColumns(page);
			if (!columns) return null;

			return columns.every(
				(column: { id?: string }) =>
					typeof column.id === 'string' &&
					/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(column.id)
			);
		})
		.toBe(true);
}

export async function expectStoredFirstColumnDisplay(
	page: Page,
	display: { title?: string; icon?: string }
) {
	await expect
		.poll(async () => {
			const column = (await readStoredColumns(page))?.[0];
			return column ? { title: column.title ?? null, icon: column.icon ?? null } : null;
		})
		.toEqual({ title: display.title ?? null, icon: display.icon ?? null });
}

export async function expectStoredWebsiteColumn(page: Page, url: string) {
	await expect
		.poll(async () => {
			const column = (await readStoredColumns(page))?.find(
				(item: { type?: string }) => item.type === 'website'
			);
			return column ? { type: column.type, url: column.url, width: column.width } : null;
		})
		.toEqual({ type: 'website', url, width: 'standard' });
}

export async function expectStoredCustomTimelineColumn(
	page: Page,
	filters: unknown = [{ kinds: [ShortTextNote], limit: 20 }],
	relays: unknown = defaultRelaySelection
) {
	await expect
		.poll(async () => {
			const column = (await readStoredColumns(page))?.find(
				(item: { timelineKind?: string }) => item.timelineKind === 'custom'
			);
			return column
				? {
						type: column.type,
						timelineKind: column.timelineKind,
						filters: column.filters,
						relays: column.relays,
						width: column.width
					}
				: null;
		})
		.toEqual({
			type: 'timeline',
			timelineKind: 'custom',
			filters,
			relays,
			width: 'standard'
		});
}

export async function expectStoredSearchColumn(page: Page, query: string) {
	await expect
		.poll(async () => {
			const column = (await readStoredColumns(page))?.find(
				(item: { timelineKind?: string; sourceKey?: string }) =>
					item.timelineKind === 'preset' && item.sourceKey === 'timeline_search'
			);
			return column
				? {
						type: column.type,
						timelineKind: column.timelineKind,
						sourceKey: column.sourceKey,
						query: column.query,
						width: column.width
					}
				: null;
		})
		.toEqual({
			type: 'timeline',
			timelineKind: 'preset',
			sourceKey: 'timeline_search',
			query,
			width: 'standard'
		});
}

export async function expectStoredChannelColumn(
	page: Page,
	channelId: string,
	relays: string[] = []
) {
	await expect
		.poll(async () => {
			const column = (await readStoredColumns(page))?.find(
				(item: { timelineKind?: string; sourceKey?: string }) =>
					item.timelineKind === 'preset' && item.sourceKey === 'timeline_channel'
			);
			return column
				? {
						type: column.type,
						timelineKind: column.timelineKind,
						sourceKey: column.sourceKey,
						channelId: column.channelId,
						relays: column.relays,
						width: column.width
					}
				: null;
		})
		.toEqual({
			type: 'timeline',
			timelineKind: 'preset',
			sourceKey: 'timeline_channel',
			channelId,
			relays,
			width: 'standard'
		});
}

export async function expectStoredFollowColumn(page: Page, pubkey: string, relays: string[] = []) {
	await expect
		.poll(async () => {
			const column = (await readStoredColumns(page))?.find(
				(item: { timelineKind?: string; sourceKey?: string }) =>
					item.timelineKind === 'preset' && item.sourceKey === 'timeline_follow'
			);
			return column
				? {
						type: column.type,
						timelineKind: column.timelineKind,
						sourceKey: column.sourceKey,
						pubkey: column.pubkey,
						relays: column.relays,
						width: column.width
					}
				: null;
		})
		.toEqual({
			type: 'timeline',
			timelineKind: 'preset',
			sourceKey: 'timeline_follow',
			pubkey,
			relays,
			width: 'standard'
		});
}

export async function requiredBox(locator: Locator, label: string) {
	await expect(locator, `${label} should be visible before measuring`).toBeVisible();

	const box = await locator.boundingBox();
	expect(box, `${label} should have a bounding box`).not.toBeNull();

	return box!;
}

export async function iconCenterX(page: Page, name: string) {
	const iconBox = await requiredBox(sidebarIconContainer(page, name), `${name} icon`);
	return iconBox.x + iconBox.width / 2;
}

export async function expectSidebarIconsCentered(page: Page, names: string[]) {
	const sidebarBox = await requiredBox(sidebar(page), 'sidebar');
	const sidebarCenterX = sidebarBox.x + sidebarBox.width / 2;

	for (const name of names) {
		const buttonBox = await requiredBox(sidebarButton(page, name), `${name} button`);
		const iconBox = await requiredBox(sidebarIconContainer(page, name), `${name} icon`);
		const iconCenter = iconBox.x + iconBox.width / 2;

		expect(
			Math.abs(iconCenter - sidebarCenterX),
			`${name} icon should be centered`
		).toBeLessThanOrEqual(sidebarCenterTolerance);
		expect(
			buttonBox.width,
			`${name} button should fit inside the collapsed sidebar`
		).toBeLessThanOrEqual(sidebarBox.width);
		expect(buttonBox.height, `${name} button should keep a visible height`).toBeGreaterThan(0);
		expect(iconBox.x, `${name} icon should stay inside the sidebar`).toBeGreaterThanOrEqual(
			sidebarBox.x
		);
		expect(
			iconBox.x + iconBox.width,
			`${name} icon should stay inside the sidebar`
		).toBeLessThanOrEqual(sidebarBox.x + sidebarBox.width);
	}
}
