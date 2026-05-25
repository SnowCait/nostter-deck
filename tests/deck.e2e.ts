import { expect, test } from '@playwright/test';
import { defaultRelays, profileRelays } from '$lib/nostr/relays';
import { fakeRelayConnectionCounts, installFakeNostrRelay } from './helpers/fake-nostr-relay';
import {
	addPresetColumn,
	columnConfigsStorageKey,
	columnNames,
	columnOptionsButton,
	deckColumns,
	defaultRelaySelection,
	expectAvatarShapeNotStoredInUiState,
	expectColumnOrder,
	expectColumnWidth,
	expectComposerNextToSidebar,
	expectFontSizeNotStoredInUiState,
	expectSidebarIconsCentered,
	expectSidebarWidth,
	expectStoredAvatarShape,
	expectStoredColumnConfigWidths,
	expectStoredColumnIdsAreOpaque,
	expectStoredCustomTimelineColumn,
	expectStoredFontSize,
	expectStoredSidebarCollapsed,
	expectStoredThemePreference,
	expectStoredWebsiteColumn,
	expectThemeNotStoredInUiState,
	fontSizePx,
	iconCenterX,
	narrowColumnWidth,
	openDeck,
	sidebar,
	sidebarButtonIcon,
	sidebarButtonNames,
	sidebarCenterTolerance,
	sidebarCollapsedWidth,
	sidebarExpandedWidth,
	standardColumnWidth,
	uiStateStorageKey,
	userSettingsStorageKey,
	wideColumnWidth
} from './helpers/deck-page';

const expectedProfileRelayUrls = [...new Set([...defaultRelays, ...profileRelays])];
const expectedProfileRelayConnections = Object.fromEntries(
	expectedProfileRelayUrls.map((relay) => [relay, 1])
);
const expectedProfileRelayRequestCount = expectedProfileRelayUrls.length;

test.describe('nostter deck', () => {
	test('shows the initial deck', async ({ page }) => {
		await openDeck(page);

		await expect(page).toHaveTitle('nostter deck');
		await expect(page.getByRole('heading', { name: 'nostter deck' })).toBeVisible();
		await expectColumnOrder(deckColumns(page), columnNames);
		await expect(sidebar(page).getByRole('button', { name: 'Post' })).toHaveCount(0);
		await expect(sidebar(page).getByTestId('account-avatar')).toHaveCount(0);
		await expect(sidebar(page).getByRole('button', { name: 'Home' })).toHaveCount(0);
		await expect(sidebar(page).getByRole('button', { name: 'Mentions' })).toHaveCount(0);
	});

	test('adds, moves, and deletes a column', async ({ page }) => {
		await openDeck(page);
		const columns = deckColumns(page);

		await addPresetColumn(page, 'timeline_search');
		await addPresetColumn(page, 'timeline_lists');

		await expectColumnOrder(columns, ['Search', 'Lists']);
		await expect(sidebarButtonIcon(page, 'Search')).toBeVisible();
		await expect(sidebarButtonIcon(page, 'Lists')).toBeVisible();

		const addedColumn = columns.nth(1);
		await columnOptionsButton(addedColumn).click();
		await addedColumn.getByRole('button', { name: 'Move column left' }).click();

		await expectColumnOrder(columns, ['Lists', 'Search']);

		await columns.first().getByRole('button', { name: 'Move column right' }).click();
		await expectColumnOrder(columns, ['Search', 'Lists']);

		await columns.nth(1).getByRole('button', { name: 'Delete column' }).click();
		await expectColumnOrder(columns, ['Search']);
	});

	test('opens the column add dialog only from the right edge plus button', async ({ page }) => {
		await openDeck(page);

		const addColumnDialog = page.getByRole('dialog', { name: 'Add column' });
		const addColumnPlaceholder = page.getByTestId('column-add-placeholder');

		await addColumnPlaceholder.getByText('Add column').click();
		await expect(addColumnDialog).toHaveCount(0);

		await addColumnPlaceholder.getByRole('button', { name: 'Add column' }).click();
		await expect(addColumnDialog).toBeVisible();
		await expect(page.getByLabel('Column type').locator('option')).toHaveText([
			'Search',
			'Lists',
			'Custom timeline',
			'Website'
		]);
	});

	test('closes the column add dialog from the backdrop only', async ({ page }) => {
		await openDeck(page);

		await page.getByRole('button', { name: 'Add column' }).first().click();
		const addColumnDialog = page.getByRole('dialog', { name: 'Add column' });
		await expect(addColumnDialog).toBeVisible();

		await addColumnDialog.click();
		await expect(addColumnDialog).toBeVisible();

		await page.mouse.click(10, 10);
		await expect(addColumnDialog).toHaveCount(0);
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

		const websiteColumn = columns.first();
		await expectColumnOrder(columns, [...columnNames, 'example.com']);
		await expectColumnWidth(websiteColumn, standardColumnWidth);
		await expect(websiteColumn.locator('iframe')).toHaveAttribute('src', 'https://example.com/');
		await expect(websiteColumn.getByRole('link')).toHaveCount(0);
		await expectStoredWebsiteColumn(page, 'https://example.com/');
		await expectStoredColumnIdsAreOpaque(page);

		await page.reload();
		await expectColumnOrder(columns, [...columnNames, 'example.com']);
		await expect(columns.first().locator('iframe')).toHaveAttribute('src', 'https://example.com/');
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

		const customColumn = columns.first();
		await expectColumnOrder(columns, [...columnNames, 'Custom timeline']);
		await expectColumnWidth(customColumn, standardColumnWidth);
		await expect(customColumn.getByText('Hello from a custom Nostr timeline')).toBeVisible();
		await expect(customColumn.getByText('Alice Relay')).toBeVisible();
		await expect(customColumn.locator('img[src^="data:image/gif"]')).toBeVisible();
		const profileAvatar = customColumn.getByTestId('post-avatar').first();
		await profileAvatar.dispatchEvent('error');
		await expect(customColumn.locator('img[src^="data:image/gif"]')).toHaveCount(0);
		await expect(profileAvatar).toHaveText('A');
		await expect(profileAvatar).toHaveClass(/rounded-full/);
		await expect(customColumn.getByText('#nostter')).toHaveCount(1);
		await expect(customColumn.getByText('Hello from a custom Nostr timeline')).toHaveCount(1);
		await expectStoredCustomTimelineColumn(page);
		await expectStoredColumnIdsAreOpaque(page);
		await expect
			.poll(async () => fakeRelayConnectionCounts(page, expectedProfileRelayUrls))
			.toEqual(expectedProfileRelayConnections);
		await expect
			.poll(async () =>
				page.evaluate(
					() =>
						window.__nostterFakeRelayProfileRequests?.[
							'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
						] ?? 0
				)
			)
			.toBe(expectedProfileRelayRequestCount);

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
		await expect(editedFiltersInput).toBeHidden();
		await expect(customColumn.getByText('Hello from a custom Nostr timeline')).toBeVisible();
		await expectStoredCustomTimelineColumn(
			page,
			[{ kinds: [1], limit: 20 }],
			initialRelaySelection
		);

		await columnOptionsButton(customColumn).click();
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
		await expect(editedFiltersInput).toBeHidden();
		await expect(customColumn.getByText('Hello from a custom Nostr timeline')).toBeVisible();
		await expect(customColumn.getByText('Repost from a custom Nostr timeline')).toBeVisible();
		await expectStoredCustomTimelineColumn(page, savedFilters, savedRelaySelection);

		await columnOptionsButton(customColumn).click();
		await customColumn.getByLabel('wss://relay.damus.io/').setChecked(true);
		await customColumn.getByLabel('wss://nos.lol/').setChecked(true);
		await editedCustomRelaysInput.fill('');
		await expect(filterSaveButton).toBeEnabled();
		await filterSaveButton.click();
		await expect(editedFiltersInput).toBeHidden();
		await expectStoredCustomTimelineColumn(page, savedFilters, defaultRelaySelection);

		await page.reload();
		await expectColumnOrder(columns, [...columnNames, 'Custom timeline']);
		await columnOptionsButton(columns.first()).click();
		await expect(columns.first().getByLabel('REQ filters')).toHaveValue(
			JSON.stringify(savedFilters, null, 2)
		);
		await expect(columns.first().getByLabel('wss://relay.damus.io/')).toBeChecked();
		await expect(columns.first().getByLabel('wss://nos.lol/')).toBeChecked();
		await expect(columns.first().getByLabel('Custom relays')).toHaveValue('');
		await expect(columns.first().getByText('Hello from a custom Nostr timeline')).toBeVisible();

		await page.getByRole('button', { name: 'Add column' }).first().click();
		await page.getByLabel('Column type').selectOption('custom_timeline');
		await page
			.getByRole('dialog', { name: 'Add column' })
			.getByRole('button', { name: 'Save' })
			.click();
		await expectColumnOrder(columns, [...columnNames, 'Custom timeline', 'Custom timeline']);
		await expect
			.poll(async () => fakeRelayConnectionCounts(page, expectedProfileRelayUrls))
			.toEqual(expectedProfileRelayConnections);
	});

	test('resolves custom timeline author addresses', async ({ page }) => {
		await installFakeNostrRelay(page);
		await openDeck(page);
		const columns = deckColumns(page);
		const contactListAddress =
			'3:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb:';
		const emptyAddressableListAddress =
			'30000:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd:';
		const namedAddressableListAddress =
			'30000:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd:favorites';
		const savedFilters = [
			{ kinds: [1], authors: contactListAddress },
			{ kinds: [1], authors: emptyAddressableListAddress },
			{ kinds: [1], authors: namedAddressableListAddress }
		];

		await page.getByRole('button', { name: 'Add column' }).first().click();
		await page.getByLabel('Column type').selectOption('custom_timeline');

		const saveButton = page.getByRole('button', { name: 'Save' });
		const filtersInput = page.getByLabel('REQ filters');

		await filtersInput.fill(
			'[{"kinds":[1],"authors":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}]'
		);
		await expect(saveButton).toBeDisabled();

		await filtersInput.fill(JSON.stringify(savedFilters));
		await expect(saveButton).toBeEnabled();
		await saveButton.click();

		const customColumn = columns.first();
		await expectColumnOrder(columns, [...columnNames, 'Custom timeline']);
		await expect(customColumn.getByText('Hello from a custom Nostr timeline')).toBeVisible();
		await expect(customColumn.getByText('Hello from a stale contact list')).toHaveCount(0);
		await expect(customColumn.getByText('Alice Relay')).toBeVisible();
		await expect(customColumn.getByText('Old Alice Relay')).toHaveCount(0);
		await expectStoredCustomTimelineColumn(page, savedFilters);
		await expect
			.poll(async () =>
				page.evaluate(
					(address) => window.__nostterFakeRelayAddressRequests?.[address] ?? 0,
					contactListAddress
				)
			)
			.toBe(expectedProfileRelayRequestCount);
		await expect
			.poll(async () =>
				page.evaluate(
					(address) => window.__nostterFakeRelayAddressRequests?.[address] ?? 0,
					emptyAddressableListAddress
				)
			)
			.toBe(2);
		await expect
			.poll(async () =>
				page.evaluate(
					(address) => window.__nostterFakeRelayAddressRequests?.[address] ?? 0,
					namedAddressableListAddress
				)
			)
			.toBe(2);
	});

	test('changes and persists column widths', async ({ page }) => {
		await openDeck(page);
		const columns = deckColumns(page);

		await addPresetColumn(page, 'timeline_search');
		await addPresetColumn(page, 'timeline_lists');

		await expectColumnOrder(columns, ['Search', 'Lists']);
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
		await expectStoredColumnConfigWidths(page, ['wide', 'standard']);

		await page.reload();
		await expectColumnOrder(columns, ['Search', 'Lists']);
		await expectColumnWidth(columns.first(), wideColumnWidth);
		await expectColumnWidth(columns.nth(1), standardColumnWidth);
		await columnOptionsButton(columns.first()).click();
		await expect(columns.first().getByLabel('Column width')).toHaveValue('wide');

		await columns.first().getByLabel('Column width').selectOption('narrow');
		await expectColumnWidth(columns.first(), narrowColumnWidth);
		await expectStoredColumnConfigWidths(page, ['narrow', 'standard']);
	});

	test('persists column changes across reloads', async ({ page }) => {
		await openDeck(page);
		const columns = deckColumns(page);

		await addPresetColumn(page, 'timeline_search');
		await addPresetColumn(page, 'timeline_lists');
		await expectColumnOrder(columns, ['Search', 'Lists']);
		await expectColumnWidth(columns.nth(1), standardColumnWidth);

		await columnOptionsButton(columns.nth(1)).click();
		await columns.nth(1).getByLabel('Column width').selectOption('wide');
		await columns.nth(1).getByRole('button', { name: 'Move column left' }).click();
		await expectColumnOrder(columns, ['Lists', 'Search']);
		await expectStoredColumnConfigWidths(page, ['wide', 'standard']);

		await page.reload();
		await expectColumnOrder(columns, ['Lists', 'Search']);
		await expectColumnWidth(columns.first(), wideColumnWidth);

		await columnOptionsButton(columns.first()).click();
		await columns.first().getByRole('button', { name: 'Delete column' }).click();
		await page.reload();
		await expectColumnOrder(columns, ['Search']);
	});

	test('collapses and expands the sidebar', async ({ page }) => {
		await openDeck(page);

		await addPresetColumn(page, 'timeline_search');
		await addPresetColumn(page, 'timeline_lists');

		await expectSidebarWidth(page, sidebarExpandedWidth);

		const collapseButton = page.getByRole('button', { name: 'Collapse sidebar' });
		await expect(collapseButton).toHaveAttribute('aria-pressed', 'false');
		const expandedIconCenterX = await iconCenterX(page, 'Collapse sidebar');

		await collapseButton.click();
		const expandButton = page.getByRole('button', { name: 'Expand sidebar' });
		await expect(expandButton).toHaveAttribute('aria-pressed', 'true');
		await expectSidebarWidth(page, sidebarCollapsedWidth);
		await expectStoredSidebarCollapsed(page, true);
		await expectSidebarIconsCentered(page, [
			...sidebarButtonNames,
			'Search',
			'Lists',
			'Expand sidebar'
		]);
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

	test('closes the settings dialog from the backdrop only', async ({ page }) => {
		await openDeck(page);

		await page.getByRole('button', { name: 'Settings' }).click();
		const settingsDialog = page.getByRole('dialog', { name: 'Settings' });
		await expect(settingsDialog).toBeVisible();

		await settingsDialog.click();
		await expect(settingsDialog).toBeVisible();

		await page.mouse.click(10, 10);
		await expect(settingsDialog).toHaveCount(0);
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
		await addPresetColumn(page, 'timeline_search');

		const postBody = page.getByText(
			'A good dashboard keeps controls close to the context they affect.'
		);
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

	test('changes and persists the profile icon shape from user settings', async ({ page }) => {
		await openDeck(page, { isLoggedIn: true });
		await addPresetColumn(page, 'timeline_search');

		const postAvatar = page.getByTestId('post-avatar').first();
		const sidebarAvatar = sidebar(page).getByTestId('account-avatar').first();
		await expect(postAvatar).toHaveClass(/rounded-full/);
		await expect(sidebarAvatar).toHaveClass(/rounded-full/);

		await page.getByRole('button', { name: 'Settings' }).click();
		const avatarShapeSelect = page.getByLabel('Profile icon');
		await expect(avatarShapeSelect).toHaveValue('circle');
		await expect
			.poll(async () =>
				avatarShapeSelect
					.locator('option')
					.evaluateAll((options) => options.map((option) => (option as HTMLOptionElement).value))
			)
			.toEqual(['circle', 'square']);

		await avatarShapeSelect.selectOption('square');
		await expectStoredAvatarShape(page, 'square');
		await expectAvatarShapeNotStoredInUiState(page);
		await expect(postAvatar).toHaveClass(/rounded-md/);
		await expect(sidebarAvatar).toHaveClass(/rounded-md/);

		await page.getByRole('button', { name: 'Close' }).click();
		await sidebar(page).getByRole('button', { name: 'Post' }).click();
		await expect(
			page.getByRole('region', { name: 'Post' }).getByTestId('account-avatar')
		).toHaveClass(/rounded-md/);

		await page.reload();
		await expect(page.getByTestId('post-avatar').first()).toHaveClass(/rounded-md/);
		await page.getByRole('button', { name: 'Settings' }).click();
		await expect(page.getByLabel('Profile icon')).toHaveValue('square');
		await expectStoredAvatarShape(page, 'square');
	});

	test('ignores invalid persisted user settings', async ({ page }) => {
		await page.addInitScript((key) => {
			window.localStorage.setItem(
				key,
				JSON.stringify({ theme: 'sepia', fontSize: 'giant', avatarShape: 'triangle' })
			);
		}, userSettingsStorageKey);
		await openDeck(page);

		await page.getByRole('button', { name: 'Settings' }).click();
		await expect(page.getByLabel('Theme')).toHaveValue('system');
		await expect(page.getByLabel('Font size')).toHaveValue('medium');
		await expect(page.getByLabel('Profile icon')).toHaveValue('circle');
	});

	test('hides logged-in-only compose controls while logged out', async ({ page }) => {
		await openDeck(page);

		await expectSidebarWidth(page, sidebarExpandedWidth);
		await expect(sidebar(page).getByRole('button', { name: 'Post' })).toHaveCount(0);
		await expect(page.getByRole('region', { name: 'Post' })).toHaveCount(0);
		await page.getByRole('button', { name: 'Collapse sidebar' }).click();
		await expectSidebarWidth(page, sidebarCollapsedWidth);
		await expect(sidebar(page).getByRole('button', { name: 'Post' })).toHaveCount(0);
		await expect(page.getByRole('region', { name: 'Post' })).toHaveCount(0);
	});

	test('opens the compose panel from the sidebar when logged in', async ({ page }) => {
		await openDeck(page, { isLoggedIn: true });

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
