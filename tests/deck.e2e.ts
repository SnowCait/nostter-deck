import { expect, test, type Locator, type Page } from '@playwright/test';

declare global {
	interface Window {
		__NOSTTER_DECK_SKIP_NOSTR_VERIFY__?: boolean;
		__NOSTTER_DECK_WEBSOCKET_CTOR__?: typeof WebSocket;
		__nostterFakeRelayConnections?: Record<string, number>;
		__nostterFakeRelayProfileRequests?: Record<string, number>;
	}
}

const columnNames = ['Home', 'Mentions', 'Search', 'Lists'];
const sidebarButtonNames = [
	'Home',
	'Mentions',
	'Search',
	'Lists',
	'Add column',
	'Post',
	'Settings'
];
const sidebarExpandedWidth = 236;
const sidebarCollapsedWidth = 60;
const composerWidth = 360;
const narrowColumnWidth = 280;
const standardColumnWidth = 342;
const wideColumnWidth = 480;
const sidebarCenterTolerance = 1;
const uiStateStorageKey = 'nostter:ui-state';
const userSettingsStorageKey = 'nostter:user-settings';
const columnConfigsStorageKey = 'nostter:column-configs';
const defaultRelaySelection = { type: 'default' };

async function openDeck(page: Page) {
	await page.addInitScript(() => {
		if (!window.localStorage.getItem('PARAGLIDE_LOCALE')) {
			window.localStorage.setItem('PARAGLIDE_LOCALE', 'en');
		}
	});
	await page.goto('/');
}

async function installFakeNostrRelay(page: Page) {
	await page.addInitScript(() => {
		const relayConnections: Record<string, number> = {};
		const relayProfileRequests: Record<string, number> = {};
		const textEvent = {
			id: 'event-custom-timeline-1',
			pubkey: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
			created_at: Math.floor(Date.now() / 1000) - 90,
			kind: 1,
			tags: [['t', 'nostter']],
			content: 'Hello from a custom Nostr timeline',
			sig: '0'.repeat(128)
		};
		const profileEvent = {
			id: 'event-profile-alice',
			pubkey: textEvent.pubkey,
			created_at: Math.floor(Date.now() / 1000) - 120,
			kind: 0,
			tags: [],
			content: JSON.stringify({
				display_name: 'Alice Relay',
				picture: 'https://example.com/alice.png'
			}),
			sig: '0'.repeat(128)
		};

		class FakeWebSocket {
			static CONNECTING = 0;
			static OPEN = 1;
			static CLOSING = 2;
			static CLOSED = 3;

			readyState = FakeWebSocket.CONNECTING;
			url: string;
			listeners: Record<string, Set<(event?: unknown) => void>> = {
				open: new Set(),
				message: new Set(),
				close: new Set()
			};

			constructor(url: string) {
				this.url = url;
				relayConnections[url] = (relayConnections[url] ?? 0) + 1;
				setTimeout(() => {
					this.readyState = FakeWebSocket.OPEN;
					this.dispatch('open');
				}, 0);
			}

			addEventListener(type: string, callback: (event?: unknown) => void) {
				this.listeners[type]?.add(callback);
			}

			removeEventListener(type: string, callback: (event?: unknown) => void) {
				this.listeners[type]?.delete(callback);
			}

			send(data: string) {
				const message = JSON.parse(data);
				if (!Array.isArray(message) || message[0] !== 'REQ') return;

				const subId = message[1] as string;
				const filters = message.slice(2) as Array<{ kinds?: number[]; authors?: string[] }>;
				const requestsTextEvents = filters.some(
					(filter) => !filter.kinds || filter.kinds.includes(1)
				);
				const requestsProfiles = filters.some(
					(filter) => filter.kinds?.includes(0) && filter.authors?.includes(textEvent.pubkey)
				);

				if (requestsTextEvents) {
					setTimeout(() => {
						this.emitMessage(['EVENT', subId, textEvent]);
						this.emitMessage(['EVENT', subId, textEvent]);
					}, 5);
				}

				if (requestsProfiles) {
					relayProfileRequests[textEvent.pubkey] =
						(relayProfileRequests[textEvent.pubkey] ?? 0) + 1;
					setTimeout(() => {
						this.emitMessage(['EVENT', subId, profileEvent]);
					}, 20);
				}
			}

			close(code = 1000) {
				this.readyState = FakeWebSocket.CLOSED;
				this.dispatch('close', { type: 'close', code, reason: '' });
			}

			emitMessage(message: unknown) {
				this.dispatch('message', {
					type: 'message',
					data: JSON.stringify(message)
				});
			}

			dispatch(type: string, event?: unknown) {
				for (const callback of this.listeners[type] ?? []) {
					callback(event);
				}
			}
		}

		window.__NOSTTER_DECK_SKIP_NOSTR_VERIFY__ = true;
		window.__NOSTTER_DECK_WEBSOCKET_CTOR__ = FakeWebSocket as unknown as typeof WebSocket;
		window.__nostterFakeRelayConnections = relayConnections;
		window.__nostterFakeRelayProfileRequests = relayProfileRequests;
	});
}

async function fakeRelayConnectionCounts(page: Page) {
	return page.evaluate(() => {
		const connections = window.__nostterFakeRelayConnections ?? {};

		return {
			damus: connections['wss://relay.damus.io/'] ?? connections['wss://relay.damus.io'],
			nos: connections['wss://nos.lol/'] ?? connections['wss://nos.lol']
		};
	});
}

function deckColumns(page: Page) {
	return page.locator('section[id^="deck-column-"]');
}

function columnOptionsButton(column: Locator) {
	return column.locator('header').getByRole('button', { name: 'Column options' });
}

function sidebar(page: Page) {
	return page.locator('aside');
}

function sidebarButton(page: Page, name: string) {
	return sidebar(page).getByRole('button', { name });
}

function sidebarIconContainer(page: Page, name: string) {
	return sidebarButton(page, name).locator('span').first();
}

async function expectSidebarWidth(page: Page, width: number) {
	await expect
		.poll(async () => Math.round((await sidebar(page).boundingBox())?.width ?? 0))
		.toBe(width);
}

async function expectStoredSidebarCollapsed(page: Page, value: boolean) {
	await expect
		.poll(async () =>
			page.evaluate((key) => {
				const storedValue = window.localStorage.getItem(key);
				return storedValue ? JSON.parse(storedValue).sidebarCollapsed : null;
			}, uiStateStorageKey)
		)
		.toBe(value);
}

async function expectStoredThemePreference(page: Page, value: string) {
	await expect
		.poll(async () =>
			page.evaluate((key) => {
				const storedValue = window.localStorage.getItem(key);
				return storedValue ? JSON.parse(storedValue).theme : null;
			}, userSettingsStorageKey)
		)
		.toBe(value);
}

async function expectStoredFontSize(page: Page, value: string) {
	await expect
		.poll(async () =>
			page.evaluate((key) => {
				const storedValue = window.localStorage.getItem(key);
				return storedValue ? JSON.parse(storedValue).fontSize : null;
			}, userSettingsStorageKey)
		)
		.toBe(value);
}

async function expectThemeNotStoredInUiState(page: Page) {
	await expect
		.poll(async () =>
			page.evaluate((key) => {
				const storedValue = window.localStorage.getItem(key);
				return storedValue ? Object.hasOwn(JSON.parse(storedValue), 'theme') : false;
			}, uiStateStorageKey)
		)
		.toBe(false);
}

async function expectFontSizeNotStoredInUiState(page: Page) {
	await expect
		.poll(async () =>
			page.evaluate((key) => {
				const storedValue = window.localStorage.getItem(key);
				return storedValue ? Object.hasOwn(JSON.parse(storedValue), 'fontSize') : false;
			}, uiStateStorageKey)
		)
		.toBe(false);
}

async function fontSizePx(locator: Locator) {
	await expect(locator).toBeVisible();

	return Number.parseFloat(
		await locator.evaluate((element) => window.getComputedStyle(element).fontSize)
	);
}

async function expectComposerNextToSidebar(page: Page, composer: Locator) {
	const sidebarBox = await requiredBox(sidebar(page), 'sidebar');
	const composerBox = await requiredBox(composer, 'composer');

	expect(Math.round(composerBox.width), 'composer should keep its lane width').toBe(composerWidth);
	expect(
		Math.abs(composerBox.x - (sidebarBox.x + sidebarBox.width)),
		'composer should sit directly next to the sidebar'
	).toBeLessThanOrEqual(sidebarCenterTolerance);
}

async function expectAbove(upper: Locator, lower: Locator, label: string) {
	const upperBox = await requiredBox(upper, `${label} upper item`);
	const lowerBox = await requiredBox(lower, `${label} lower item`);

	expect(upperBox.y + upperBox.height, `${label} should be above`).toBeLessThanOrEqual(lowerBox.y);
}

async function expectColumnOrder(columns: Locator, names: string[]) {
	await expect(columns).toHaveCount(names.length);
	await expect(columns.locator('header h2')).toHaveText(names);
}

async function expectColumnWidth(column: Locator, width: number) {
	await expect.poll(async () => Math.round((await column.boundingBox())?.width ?? 0)).toBe(width);
}

async function expectStoredColumnConfigWidths(page: Page, widths: string[]) {
	await expect
		.poll(async () =>
			page.evaluate((key) => {
				const storedValue = window.localStorage.getItem(key);
				return storedValue
					? JSON.parse(storedValue).map((column: { width: string }) => column.width)
					: null;
			}, columnConfigsStorageKey)
		)
		.toEqual(widths);
}

async function expectStoredWebsiteColumn(page: Page, url: string) {
	await expect
		.poll(async () =>
			page.evaluate((key) => {
				const storedValue = window.localStorage.getItem(key);
				if (!storedValue) return null;

				const column = JSON.parse(storedValue).find(
					(item: { type?: string }) => item.type === 'website'
				);
				return column ? { type: column.type, url: column.url, width: column.width } : null;
			}, columnConfigsStorageKey)
		)
		.toEqual({ type: 'website', url, width: 'standard' });
}

async function expectStoredCustomTimelineColumn(
	page: Page,
	filters = [{ kinds: [1], limit: 20 }],
	relays: unknown = defaultRelaySelection
) {
	await expect
		.poll(async () =>
			page.evaluate((key) => {
				const storedValue = window.localStorage.getItem(key);
				if (!storedValue) return null;

				const column = JSON.parse(storedValue).find(
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
			}, columnConfigsStorageKey)
		)
		.toEqual({
			type: 'timeline',
			timelineKind: 'custom',
			filters,
			relays,
			width: 'standard'
		});
}

async function requiredBox(locator: Locator, label: string) {
	await expect(locator, `${label} should be visible before measuring`).toBeVisible();

	const box = await locator.boundingBox();
	expect(box, `${label} should have a bounding box`).not.toBeNull();

	return box!;
}

async function iconCenterX(page: Page, name: string) {
	const iconBox = await requiredBox(sidebarIconContainer(page, name), `${name} icon`);
	return iconBox.x + iconBox.width / 2;
}

async function expectSidebarIconsCentered(page: Page, names: string[]) {
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

test.describe('nostter deck', () => {
	test('shows the initial deck', async ({ page }) => {
		await openDeck(page);

		await expect(page).toHaveTitle('nostter deck');
		await expect(page.getByRole('heading', { name: 'nostter deck' })).toBeVisible();
		await expectAbove(
			sidebar(page).getByRole('button', { name: 'Post' }),
			sidebar(page).getByRole('button', { name: 'Home' }),
			'Post button'
		);
		await expectColumnOrder(deckColumns(page), columnNames);
		await expect(page.getByText('Shipping a desktop-first deck today.')).toBeVisible();
		await expect(
			page.getByText('Can the compose box keep the selected column context?')
		).toBeVisible();
	});

	test('adds, moves, and deletes a column', async ({ page }) => {
		await openDeck(page);
		const columns = deckColumns(page);

		await page.getByRole('button', { name: 'Add column' }).first().click();
		await expect(page.getByRole('dialog', { name: 'Add column' })).toBeVisible();
		await page.getByLabel('Column type').selectOption('timeline_search');
		await page.getByRole('button', { name: 'Save' }).click();

		await expectColumnOrder(columns, ['Home', 'Mentions', 'Search', 'Lists', 'Search']);

		const addedColumn = columns.nth(4);
		await columnOptionsButton(addedColumn).click();
		await addedColumn.getByRole('button', { name: 'Move column left' }).click();

		await expectColumnOrder(columns, ['Home', 'Mentions', 'Search', 'Search', 'Lists']);

		await columns.nth(3).getByRole('button', { name: 'Move column right' }).click();
		await expectColumnOrder(columns, ['Home', 'Mentions', 'Search', 'Lists', 'Search']);

		await columns.nth(4).getByRole('button', { name: 'Delete column' }).click();
		await expectColumnOrder(columns, columnNames);
	});

	test('adds and persists a website column', async ({ page }) => {
		await openDeck(page);
		const columns = deckColumns(page);

		await page.getByRole('button', { name: 'Add column' }).first().click();
		await expect(page.getByLabel('Website URL')).toHaveCount(0);

		await page.getByLabel('Column type').selectOption('website');
		const saveButton = page.getByRole('button', { name: 'Save' });
		const urlInput = page.getByLabel('Website URL');
		await expect(urlInput).toBeVisible();
		await expect(saveButton).toBeDisabled();

		await urlInput.fill('http://example.com');
		await expect(saveButton).toBeDisabled();

		await urlInput.fill('example.com');
		await expect(saveButton).toBeEnabled();
		await saveButton.click();

		const websiteColumn = columns.nth(4);
		await expectColumnOrder(columns, [...columnNames, 'example.com']);
		await expectColumnWidth(websiteColumn, standardColumnWidth);
		await expect(websiteColumn.locator('iframe')).toHaveAttribute('src', 'https://example.com/');
		await expect(websiteColumn.getByRole('link')).toHaveCount(0);
		await expectStoredWebsiteColumn(page, 'https://example.com/');

		await page.reload();
		await expectColumnOrder(columns, [...columnNames, 'example.com']);
		await expect(columns.nth(4).locator('iframe')).toHaveAttribute('src', 'https://example.com/');
	});

	test('adds and persists a custom timeline column', async ({ page }) => {
		await installFakeNostrRelay(page);
		await openDeck(page);
		const columns = deckColumns(page);

		await page.getByRole('button', { name: 'Add column' }).first().click();
		await expect(page.getByLabel('REQ filters')).toHaveCount(0);

		await page.getByLabel('Column type').selectOption('custom_timeline');
		const saveButton = page.getByRole('button', { name: 'Save' });
		const filtersInput = page.getByLabel('REQ filters');
		const customRelaysInput = page.getByLabel('Custom relays');
		await expect(filtersInput).toBeVisible();
		await expect(filtersInput).toHaveValue('[{"kinds":[1],"limit":20}]');
		await expect(page.getByLabel('wss://relay.damus.io/')).toBeChecked();
		await expect(page.getByLabel('wss://nos.lol/')).toBeChecked();
		await expect(customRelaysInput).toHaveValue('');
		await expect(saveButton).toBeEnabled();

		await filtersInput.fill('{"kinds":[1],"limit":20}');
		await expect(saveButton).toBeDisabled();

		await filtersInput.fill('[]');
		await expect(saveButton).toBeDisabled();

		await filtersInput.fill('[{"kinds":[1],"limit":20}, 1]');
		await expect(saveButton).toBeDisabled();

		await filtersInput.fill('[{"kinds":[1],"limit":20}]');
		await expect(saveButton).toBeEnabled();

		await customRelaysInput.fill('https://relay.example.com');
		await expect(saveButton).toBeDisabled();

		await customRelaysInput.fill('ws://relay.example.com');
		await expect(saveButton).toBeDisabled();

		await customRelaysInput.fill('');
		await expect(saveButton).toBeEnabled();
		await saveButton.click();

		const customColumn = columns.nth(4);
		await expectColumnOrder(columns, [...columnNames, 'Custom timeline']);
		await expectColumnWidth(customColumn, standardColumnWidth);
		await expect(customColumn.getByText('Hello from a custom Nostr timeline')).toBeVisible();
		await expect(customColumn.getByText('Alice Relay')).toBeVisible();
		await expect(customColumn.locator('img[src="https://example.com/alice.png"]')).toBeVisible();
		await expect(customColumn.getByText('#nostter')).toHaveCount(1);
		await expect(customColumn.getByText('Hello from a custom Nostr timeline')).toHaveCount(1);
		await expectStoredCustomTimelineColumn(page);
		await expect.poll(async () => fakeRelayConnectionCounts(page)).toEqual({ damus: 1, nos: 1 });
		await expect
			.poll(async () =>
				page.evaluate(
					() =>
						window.__nostterFakeRelayProfileRequests?.[
							'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
						] ?? 0
				)
			)
			.toBe(2);

		await columnOptionsButton(customColumn).click();

		const savedFilters = [
			{ kinds: [1], limit: 2 },
			{ kinds: [6], limit: 2 }
		];
		const initialRelaySelection = {
			type: 'custom',
			urls: ['wss://relay.damus.io/', 'wss://relay.example.com/']
		};
		const savedRelaySelection = {
			type: 'custom',
			urls: ['wss://nos.lol/', 'wss://relay.example.net/']
		};
		const editedFiltersInput = customColumn.getByLabel('REQ filters');
		const editedCustomRelaysInput = customColumn.getByLabel('Custom relays');
		const filterSaveButton = customColumn.getByRole('button', { name: 'Save' });
		await expect(editedFiltersInput).toHaveValue(
			JSON.stringify([{ kinds: [1], limit: 20 }], null, 2)
		);
		await expect(customColumn.getByLabel('wss://relay.damus.io/')).toBeChecked();
		await expect(customColumn.getByLabel('wss://nos.lol/')).toBeChecked();
		await expect(editedCustomRelaysInput).toHaveValue('');

		await customColumn.getByLabel('wss://relay.damus.io/').setChecked(false);
		await customColumn.getByLabel('wss://nos.lol/').setChecked(false);
		await expect(filterSaveButton).toBeDisabled();

		await customColumn.getByLabel('wss://relay.damus.io/').setChecked(true);
		await editedCustomRelaysInput.fill('wss://relay.example.com');
		await expect(filterSaveButton).toBeEnabled();
		await filterSaveButton.click();
		await expect(customColumn.getByText('Hello from a custom Nostr timeline')).toBeVisible();
		await expectStoredCustomTimelineColumn(
			page,
			[{ kinds: [1], limit: 20 }],
			initialRelaySelection
		);

		await expect(customColumn.getByLabel('wss://relay.damus.io/')).toBeChecked();
		await expect(customColumn.getByLabel('wss://nos.lol/')).not.toBeChecked();
		await expect(editedCustomRelaysInput).toHaveValue('wss://relay.example.com/');

		await editedFiltersInput.fill('{"kinds":[1],"limit":2}');
		await expect(filterSaveButton).toBeDisabled();
		await expect(customColumn.getByText('Hello from a custom Nostr timeline')).toBeVisible();
		await expectStoredCustomTimelineColumn(
			page,
			[{ kinds: [1], limit: 20 }],
			initialRelaySelection
		);

		await editedFiltersInput.fill(JSON.stringify(savedFilters, null, 2));
		await editedCustomRelaysInput.fill('https://relay.example.net');
		await expect(filterSaveButton).toBeDisabled();
		await expect(customColumn.getByText('Hello from a custom Nostr timeline')).toBeVisible();
		await expectStoredCustomTimelineColumn(
			page,
			[{ kinds: [1], limit: 20 }],
			initialRelaySelection
		);

		await editedFiltersInput.fill(JSON.stringify(savedFilters, null, 2));
		await customColumn.getByLabel('wss://relay.damus.io/').setChecked(false);
		await customColumn.getByLabel('wss://nos.lol/').setChecked(true);
		await editedCustomRelaysInput.fill('wss://relay.example.net');
		await expect(filterSaveButton).toBeEnabled();
		await expectStoredCustomTimelineColumn(
			page,
			[{ kinds: [1], limit: 20 }],
			initialRelaySelection
		);

		await filterSaveButton.click();
		await expect(customColumn.getByText('Hello from a custom Nostr timeline')).toBeVisible();
		await expectStoredCustomTimelineColumn(page, savedFilters, savedRelaySelection);

		await customColumn.getByLabel('wss://relay.damus.io/').setChecked(true);
		await customColumn.getByLabel('wss://nos.lol/').setChecked(true);
		await editedCustomRelaysInput.fill('');
		await expect(filterSaveButton).toBeEnabled();
		await filterSaveButton.click();
		await expectStoredCustomTimelineColumn(page, savedFilters, defaultRelaySelection);

		await page.reload();
		await expectColumnOrder(columns, [...columnNames, 'Custom timeline']);
		await columnOptionsButton(columns.nth(4)).click();
		await expect(columns.nth(4).getByLabel('REQ filters')).toHaveValue(
			JSON.stringify(savedFilters, null, 2)
		);
		await expect(columns.nth(4).getByLabel('wss://relay.damus.io/')).toBeChecked();
		await expect(columns.nth(4).getByLabel('wss://nos.lol/')).toBeChecked();
		await expect(columns.nth(4).getByLabel('Custom relays')).toHaveValue('');
		await expect(columns.nth(4).getByText('Hello from a custom Nostr timeline')).toBeVisible();

		await page.getByRole('button', { name: 'Add column' }).first().click();
		await page.getByLabel('Column type').selectOption('custom_timeline');
		await page
			.getByRole('dialog', { name: 'Add column' })
			.getByRole('button', { name: 'Save' })
			.click();
		await expectColumnOrder(columns, [...columnNames, 'Custom timeline', 'Custom timeline']);
		await expect.poll(async () => fakeRelayConnectionCounts(page)).toEqual({ damus: 1, nos: 1 });
	});

	test('changes and persists column widths', async ({ page }) => {
		await openDeck(page);
		const columns = deckColumns(page);

		await expectColumnWidth(columns.first(), standardColumnWidth);
		await expectColumnWidth(columns.nth(1), standardColumnWidth);

		await columnOptionsButton(columns.first()).click();
		const widthSelect = columns.first().getByLabel('Column width');
		await expect(widthSelect).toHaveValue('standard');
		await expect
			.poll(async () =>
				widthSelect
					.locator('option')
					.evaluateAll((options) => options.map((option) => (option as HTMLOptionElement).value))
			)
			.toEqual(['wide', 'standard', 'narrow']);

		await widthSelect.selectOption('wide');
		await expectColumnWidth(columns.first(), wideColumnWidth);
		await expectColumnWidth(columns.nth(1), standardColumnWidth);
		await expectStoredColumnConfigWidths(page, ['wide', 'standard', 'standard', 'standard']);

		await page.reload();
		await expectColumnOrder(columns, columnNames);
		await expectColumnWidth(columns.first(), wideColumnWidth);
		await expectColumnWidth(columns.nth(1), standardColumnWidth);
		await columnOptionsButton(columns.first()).click();
		await expect(columns.first().getByLabel('Column width')).toHaveValue('wide');

		await columns.first().getByLabel('Column width').selectOption('narrow');
		await expectColumnWidth(columns.first(), narrowColumnWidth);
		await expectStoredColumnConfigWidths(page, ['narrow', 'standard', 'standard', 'standard']);
	});

	test('persists column changes across reloads', async ({ page }) => {
		await openDeck(page);
		const columns = deckColumns(page);

		await page.getByRole('button', { name: 'Add column' }).first().click();
		await page.getByLabel('Column type').selectOption('timeline_search');
		await page.getByRole('button', { name: 'Save' }).click();
		await expectColumnOrder(columns, ['Home', 'Mentions', 'Search', 'Lists', 'Search']);
		await expectColumnWidth(columns.nth(4), standardColumnWidth);

		await columnOptionsButton(columns.nth(4)).click();
		await columns.nth(4).getByLabel('Column width').selectOption('wide');
		await columns.nth(4).getByRole('button', { name: 'Move column left' }).click();
		await expectColumnOrder(columns, ['Home', 'Mentions', 'Search', 'Search', 'Lists']);
		await expectStoredColumnConfigWidths(page, [
			'standard',
			'standard',
			'standard',
			'wide',
			'standard'
		]);

		await page.reload();
		await expectColumnOrder(columns, ['Home', 'Mentions', 'Search', 'Search', 'Lists']);
		await expectColumnWidth(columns.nth(3), wideColumnWidth);

		await columnOptionsButton(columns.nth(3)).click();
		await columns.nth(3).getByRole('button', { name: 'Delete column' }).click();
		await page.reload();
		await expectColumnOrder(columns, columnNames);
	});

	test('collapses and expands the sidebar', async ({ page }) => {
		await openDeck(page);

		await expectSidebarWidth(page, sidebarExpandedWidth);

		const collapseButton = page.getByRole('button', { name: 'Collapse sidebar' });
		await expect(collapseButton).toHaveAttribute('aria-pressed', 'false');
		const expandedIconCenterX = await iconCenterX(page, 'Collapse sidebar');

		await collapseButton.click();
		const expandButton = page.getByRole('button', { name: 'Expand sidebar' });
		await expect(expandButton).toHaveAttribute('aria-pressed', 'true');
		await expectSidebarWidth(page, sidebarCollapsedWidth);
		await expectStoredSidebarCollapsed(page, true);
		await expectSidebarIconsCentered(page, [...sidebarButtonNames, 'Expand sidebar']);
		expect(
			Math.abs((await iconCenterX(page, 'Expand sidebar')) - expandedIconCenterX)
		).toBeLessThanOrEqual(sidebarCenterTolerance);

		await page.reload();
		await expect(page.getByRole('button', { name: 'Expand sidebar' })).toHaveAttribute(
			'aria-pressed',
			'true'
		);
		await expectSidebarWidth(page, sidebarCollapsedWidth);

		await expandButton.click();
		await expect(page.getByRole('button', { name: 'Collapse sidebar' })).toHaveAttribute(
			'aria-pressed',
			'false'
		);
		await expectSidebarWidth(page, sidebarExpandedWidth);
		await expectStoredSidebarCollapsed(page, false);

		await page.reload();
		await expect(page.getByRole('button', { name: 'Collapse sidebar' })).toHaveAttribute(
			'aria-pressed',
			'false'
		);
		await expectSidebarWidth(page, sidebarExpandedWidth);
	});

	test('ignores invalid persisted sidebar state', async ({ page }) => {
		await page.addInitScript((key) => {
			window.localStorage.setItem(key, 'not-json');
		}, uiStateStorageKey);
		await openDeck(page);

		await expect(page.getByRole('button', { name: 'Collapse sidebar' })).toHaveAttribute(
			'aria-pressed',
			'false'
		);
		await expectSidebarWidth(page, sidebarExpandedWidth);
	});

	test('ignores invalid persisted column configs', async ({ page }) => {
		await page.addInitScript((key) => {
			window.localStorage.setItem(
				key,
				JSON.stringify([{ id: 'old-format', sourceKey: 'timeline_home', width: 'standard' }])
			);
		}, columnConfigsStorageKey);
		await openDeck(page);

		await expectColumnOrder(deckColumns(page), columnNames);
		await expectColumnWidth(deckColumns(page).first(), standardColumnWidth);
	});

	test('changes language from the settings dialog', async ({ page }) => {
		await openDeck(page);

		await expect(sidebar(page).getByText('Language')).toHaveCount(0);

		await page.getByRole('button', { name: 'Settings' }).click();
		await expect(page.getByRole('dialog', { name: 'Settings' })).toBeVisible();
		await expect(page.getByLabel('Language')).toHaveValue('en');

		await page.getByLabel('Language').selectOption('ja');
		await expect(sidebar(page).getByRole('button', { name: '設定', exact: true })).toBeVisible();

		await sidebar(page).getByRole('button', { name: '設定', exact: true }).click();
		await expect(page.getByRole('dialog', { name: '設定' })).toBeVisible();
		await expect(page.getByLabel('言語')).toHaveValue('ja');

		await page.getByLabel('言語').selectOption('en');
		await expect(page.getByRole('button', { name: 'Settings' })).toBeVisible();

		await page.getByRole('button', { name: 'Settings' }).click();
		await page.getByRole('button', { name: 'Close' }).click();
		await expect(page.getByRole('dialog', { name: 'Settings' })).toBeHidden();
	});

	test('changes and persists the theme from user settings', async ({ page }) => {
		await openDeck(page);

		await page.getByRole('button', { name: 'Settings' }).click();
		await expect(page.getByRole('dialog', { name: 'Settings' })).toBeVisible();
		await expect(page.getByText('General')).toBeVisible();
		await expect(page.getByText('Appearance')).toBeVisible();
		await expect(page.getByLabel('Theme')).toHaveValue('system');
		await expect(page.getByLabel('Font size')).toHaveValue('medium');

		await page.getByLabel('Theme').selectOption('dark');
		await expect(page.locator('html')).toHaveClass(/dark/);
		await expectStoredThemePreference(page, 'dark');
		await expectThemeNotStoredInUiState(page);
		await expect(page.locator('main')).toHaveCSS('color-scheme', 'dark');

		await page.reload();
		await expect(page.locator('html')).toHaveClass(/dark/);
		await page.getByRole('button', { name: 'Settings' }).click();
		await expect(page.getByLabel('Theme')).toHaveValue('dark');

		await page.getByLabel('Theme').selectOption('light');
		await expect(page.locator('html')).not.toHaveClass(/dark/);
		await expectStoredThemePreference(page, 'light');
		await expectThemeNotStoredInUiState(page);
	});

	test('changes and persists the font size from user settings', async ({ page }) => {
		await openDeck(page);

		const postBody = page.getByText('Shipping a desktop-first deck today.');
		const mediumFontSize = await fontSizePx(postBody);

		await page.getByRole('button', { name: 'Settings' }).click();
		const fontSizeSelect = page.getByLabel('Font size');
		const fontSizeLabel = page.getByText('Font size');
		const mediumSettingsFontSize = await fontSizePx(fontSizeLabel);

		await expect(fontSizeSelect).toHaveValue('medium');
		await expect
			.poll(async () =>
				fontSizeSelect
					.locator('option')
					.evaluateAll((options) => options.map((option) => (option as HTMLOptionElement).value))
			)
			.toEqual(['large', 'medium', 'small']);

		await fontSizeSelect.selectOption('small');
		await expectStoredFontSize(page, 'small');
		await expectFontSizeNotStoredInUiState(page);
		await expect.poll(() => fontSizePx(postBody)).toBeLessThan(mediumFontSize);
		await expect.poll(() => fontSizePx(fontSizeLabel)).toBeLessThan(mediumSettingsFontSize);

		await fontSizeSelect.selectOption('large');
		await expectStoredFontSize(page, 'large');
		await expect.poll(() => fontSizePx(postBody)).toBeGreaterThan(mediumFontSize);
		await expect.poll(() => fontSizePx(fontSizeLabel)).toBeGreaterThan(mediumSettingsFontSize);

		await page.reload();
		await page.getByRole('button', { name: 'Settings' }).click();
		await expect(page.getByLabel('Font size')).toHaveValue('large');
		await expectStoredFontSize(page, 'large');
	});

	test('ignores invalid persisted user settings', async ({ page }) => {
		await page.addInitScript((key) => {
			window.localStorage.setItem(key, JSON.stringify({ theme: 'sepia', fontSize: 'giant' }));
		}, userSettingsStorageKey);
		await openDeck(page);

		await page.getByRole('button', { name: 'Settings' }).click();
		await expect(page.getByLabel('Theme')).toHaveValue('system');
		await expect(page.getByLabel('Font size')).toHaveValue('medium');
	});

	test('opens the compose panel from the sidebar', async ({ page }) => {
		await openDeck(page);

		await sidebar(page).getByRole('button', { name: 'Post' }).click();
		await expectSidebarWidth(page, sidebarExpandedWidth);
		const composer = page.getByRole('region', { name: 'Post' });
		await expect(composer).toBeVisible();
		await expectComposerNextToSidebar(page, composer);
		await expect(composer.getByText('Mika', { exact: true })).toBeVisible();
		await expect(composer.getByLabel('Post text')).toHaveValue('');
		await expect(composer.getByText('0 / 280')).toBeVisible();
		await expect(composer.getByRole('button', { name: 'Post', exact: true })).toBeDisabled();

		await expect(composer.getByRole('button', { name: 'Add media' })).toBeVisible();
		await expect(composer.getByRole('button', { name: 'Add emoji' })).toBeVisible();
		await expect(composer.getByRole('button', { name: 'Schedule post' })).toBeVisible();
		await expect(composer.getByRole('button', { name: 'Post visibility' })).toHaveCount(0);

		await composer.getByLabel('Post text').fill('Drafting from the deck.');
		await expect(composer.getByText('23 / 280')).toBeVisible();
		await expect(composer.getByRole('button', { name: 'Post', exact: true })).toBeEnabled();

		await composer.getByLabel('Post text').fill('x'.repeat(281));
		await expect(composer.getByText('281 / 280')).toBeVisible();
		await expect(composer.getByRole('button', { name: 'Post', exact: true })).toBeDisabled();

		await composer.getByRole('button', { name: 'Close' }).click();
		await expect(composer).toBeHidden();
		await expectSidebarWidth(page, sidebarExpandedWidth);

		await sidebar(page).getByRole('button', { name: 'Post' }).click();
		await expect(composer).toBeVisible();
		await expect(composer.getByLabel('Post text')).toHaveValue('x'.repeat(281));
		await sidebar(page).getByRole('button', { name: 'Post' }).click();
		await expect(composer).toBeHidden();

		await page.getByRole('button', { name: 'Collapse sidebar' }).click();
		await expectSidebarWidth(page, sidebarCollapsedWidth);
		await sidebar(page).getByRole('button', { name: 'Post' }).click();
		await expectSidebarWidth(page, sidebarCollapsedWidth);
		await expect(composer).toBeVisible();
		await expectComposerNextToSidebar(page, composer);
		await sidebar(page).getByRole('button', { name: 'Post' }).click();
		await expect(composer).toBeHidden();
	});
});
