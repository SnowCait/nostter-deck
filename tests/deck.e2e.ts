import { expect, test } from '@playwright/test';
import { Reaction, Repost, ShortTextNote } from 'nostr-tools/kinds';
import { nprofileEncode, npubEncode } from 'nostr-tools/nip19';
import { defaultRelays, profileRelays, searchRelays } from '$lib/nostr/relays';
import { fakeRelayConnectionCounts, installFakeNostrRelay } from './helpers/fake-nostr-relay';
import {
	addCustomTimelineColumn,
	addPresetColumn,
	addWebsiteColumn,
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
	expectStoredChannelColumn,
	expectStoredColumnConfigWidths,
	expectStoredColumnIdsAreOpaque,
	expectStoredFirstColumnDisplay,
	expectStoredCustomTimelineColumn,
	expectStoredFollowColumn,
	expectStoredFontSize,
	expectStoredSearchColumn,
	expectStoredSidebarCollapsed,
	expectStoredThemePreference,
	expectStoredWebsiteColumn,
	expectThemeNotStoredInUiState,
	fontSizePx,
	iconCenterX,
	narrowColumnWidth,
	openDeck,
	selectColumnType,
	selectDropdownOption,
	sidebar,
	sidebarButtonIcon,
	sidebarButtonNames,
	sidebarCenterTolerance,
	sidebarCollapsedWidth,
	sidebarExpandedWidth,
	standardColumnWidth,
	wideColumnWidth
} from './helpers/deck-page';

const expectedProfileRelayUrls = [...new Set([...defaultRelays, ...profileRelays])];
const expectedProfileRelayConnections = Object.fromEntries(
	expectedProfileRelayUrls.map((relay) => [relay, 1])
);
const expectedProfileRelayRequestCount = expectedProfileRelayUrls.length;
const contactListAuthorPubkey = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const textEventPubkey = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const staleContactPubkey = 'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc';
const followRelayHint = 'wss://follow.example/';
const contactListNpub = npubEncode(contactListAuthorPubkey);
const contactListNprofile = nprofileEncode({
	pubkey: contactListAuthorPubkey,
	relays: [followRelayHint]
});
const nostrNpub = 'nostr:npub1424242424242424242424242424242424242424242424242424qamrcaj';
const nostrNprofile =
	'nostr:nprofile1qy28wumn8ghj7un9d3shjtn90psk6urvv5hsqg924242424242424242424242424242424242424242424242424gv3cla6';
const nostrFallbackNpub = 'nostr:npub1lllllllllllllllllllllllllllllllllllllllllllllllllllsq7lrjw';
const nostrNote = 'nostr:note1zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zygsglnzgl';
const nostrNevent =
	'nostr:nevent1qvzqqqqqqypzp242424242424242424242424242424242424242424242424242qy28wumn8ghj7un9d3shjtn90psk6urvv5hsqgq3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyuv4j77';
const nostrNaddr =
	'nostr:naddr1qvzqqqr4gupzp242424242424242424242424242424242424242424242424242qy28wumn8ghj7un9d3shjtn90psk6urvv5hsqpmpwf6xjcmvv5hynj0x';
const imagePreviewUrl = 'https://example.com/image-without-extension';
const linkPreviewUrl = 'https://example.com/article';
const pathPreviewUrl = 'https://example.com/path?from=nostter';
const tallPreviewSvg =
	'<svg xmlns="http://www.w3.org/2000/svg" width="120" height="240"><rect width="120" height="240" fill="black"/></svg>';

test.describe('nostter deck', () => {
	test('shows the initial deck', async ({ page }) => {
		await openDeck(page);

		await expect(page).toHaveTitle('nostter deck');
		await expect(page.getByRole('heading', { name: 'nostter deck' })).toBeVisible();
		await expect(sidebar(page).locator('img[src="/favicon.svg"]')).toBeVisible();
		await expect(sidebar(page).getByRole('img', { name: 'nostter deck' })).toHaveAttribute(
			'src',
			'/logo.svg'
		);
		await expectColumnOrder(deckColumns(page), columnNames);
		await expect(sidebar(page).getByRole('button', { name: 'Post' })).toHaveCount(0);
		await expect(sidebar(page).getByTestId('account-avatar')).toHaveCount(0);
	});

	test('keeps page scrolling inside app regions on mobile viewports', async ({ page }) => {
		await installFakeNostrRelay(page);

		for (const viewport of [
			{ width: 390, height: 844 },
			{ width: 844, height: 390 },
			{ width: 768, height: 1024 }
		]) {
			await page.setViewportSize(viewport);
			await openDeck(page, { isLoggedIn: true });
			await expect
				.poll(() =>
					page.evaluate(() => ({
						innerHeight: window.innerHeight,
						documentHeight: document.documentElement.scrollHeight,
						bodyHeight: document.body.scrollHeight,
						mainHeight: document.querySelector('main')?.getBoundingClientRect().height,
						scrollY: window.scrollY
					}))
				)
				.toEqual({
					innerHeight: viewport.height,
					documentHeight: viewport.height,
					bodyHeight: viewport.height,
					mainHeight: viewport.height,
					scrollY: 0
				});
		}

		await page.setViewportSize({ width: 844, height: 390 });
		await page.getByRole('button', { name: 'Settings' }).click();
		const settingsDialog = page.getByRole('dialog', { name: 'Settings' });
		await expect(settingsDialog).toBeVisible();
		await expect
			.poll(() => settingsDialog.evaluate((element) => element.scrollHeight > element.clientHeight))
			.toBe(true);
		await page.getByRole('button', { name: 'Close' }).click();

		await page.getByRole('button', { name: 'Add column' }).first().click();
		await selectColumnType(page, 'custom_timeline');
		const addColumnDialog = page.getByRole('dialog', { name: 'Add column' });
		await expect
			.poll(() =>
				addColumnDialog.evaluate((element) => element.scrollHeight > element.clientHeight)
			)
			.toBe(true);
		await addColumnDialog.getByRole('button', { name: 'Save' }).click();

		const column = deckColumns(page).first();
		await columnOptionsButton(column).click();
		await expect
			.poll(() =>
				column
					.getByTestId('column-settings-scroll')
					.evaluate((element) => element.scrollHeight > element.clientHeight)
			)
			.toBe(true);

		await sidebar(page).getByRole('button', { name: 'Post' }).click();
		await expect
			.poll(() =>
				page
					.getByTestId('compose-panel-scroll')
					.evaluate((element) => element.scrollHeight > element.clientHeight)
			)
			.toBe(true);
		await expect
			.poll(() => sidebar(page).evaluate((element) => element.scrollHeight > element.clientHeight))
			.toBe(true);
		await expect(page).toHaveURL('/');
		await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
	});

	test('adds, moves, and deletes a column', async ({ page }) => {
		await installFakeNostrRelay(page);
		await openDeck(page);
		const columns = deckColumns(page);

		await addPresetColumn(page, 'timeline_search');
		await addWebsiteColumn(page, 'example.com');

		await expectColumnOrder(columns, ['Search', 'example.com']);
		await expect(sidebarButtonIcon(page, 'Search')).toBeVisible();
		await expect(sidebarButtonIcon(page, 'example.com')).toBeVisible();

		const addedColumn = columns.nth(1);
		await columnOptionsButton(addedColumn).click();
		await addedColumn.getByRole('button', { name: 'Move column left' }).click();

		await expectColumnOrder(columns, ['example.com', 'Search']);

		await columns.first().getByRole('button', { name: 'Move column right' }).click();
		await expectColumnOrder(columns, ['Search', 'example.com']);

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
		await page.getByLabel('Column type').click();
		await expect(page.getByRole('option')).toHaveText([
			'Follow',
			'Search',
			'Channel',
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

		await selectColumnType(page, 'website');
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

	test('adds, edits, and persists a follow preset column', async ({ page }) => {
		await installFakeNostrRelay(page);
		await openDeck(page);
		const columns = deckColumns(page);

		await page.getByRole('button', { name: 'Add column' }).first().click();
		const addDialog = page.getByRole('dialog', { name: 'Add column' });
		await expect(page.getByLabel('Column type')).toHaveText('Follow');
		const targetInput = addDialog.getByLabel('npub or nprofile');
		const saveButton = addDialog.getByRole('button', { name: 'Save' });
		await expect(targetInput).toBeVisible();
		await expect(saveButton).toBeDisabled();

		await targetInput.fill('not-a-profile');
		await expect(saveButton).toBeDisabled();

		await targetInput.fill(contactListNprofile);
		await expect(saveButton).toBeEnabled();
		await saveButton.click();

		const followColumn = columns.first();
		await expectColumnOrder(columns, [...columnNames, 'Follow']);
		await expect(followColumn.getByText('Hello from a custom Nostr timeline')).toBeVisible();
		await expectStoredFollowColumn(page, contactListAuthorPubkey, [followRelayHint]);
		await expect
			.poll(async () =>
				fakeRelayConnectionCounts(page, [...defaultRelays, followRelayHint, ...profileRelays])
			)
			.toEqual(
				Object.fromEntries(
					[...new Set([...defaultRelays, followRelayHint, ...profileRelays])].map((relay) => [
						relay,
						1
					])
				)
			);
		await expect
			.poll(async () =>
				page.evaluate(
					(address) => window.__nostterFakeRelayAddressRequests?.[address] ?? 0,
					`3:${contactListAuthorPubkey}:`
				)
			)
			.toBe([...new Set([...defaultRelays, followRelayHint, ...profileRelays])].length);
		await expect
			.poll(async () =>
				page.evaluate(
					(key) => window.__nostterFakeRelayTimelineAuthorRequests?.[key] ?? 0,
					[textEventPubkey, contactListAuthorPubkey].sort().join(',')
				)
			)
			.toBeGreaterThan(0);

		await columnOptionsButton(followColumn).click();
		const editInput = followColumn.getByLabel('npub or nprofile');
		await expect(editInput).toHaveValue(contactListNpub);
		await editInput.fill(contactListNpub);
		await followColumn.getByRole('button', { name: 'Save' }).click();
		await expect(followColumn.getByLabel('npub or nprofile')).toHaveCount(0);
		await expectStoredFollowColumn(page, contactListAuthorPubkey, []);

		await page.reload();
		await expectColumnOrder(columns, [...columnNames, 'Follow']);
		await expect(followColumn.getByText('Hello from a custom Nostr timeline')).toBeVisible();
		await expectStoredFollowColumn(page, contactListAuthorPubkey, []);
	});

	test('adds, edits, and persists a search preset column', async ({ page }) => {
		await installFakeNostrRelay(page);
		await openDeck(page);
		const columns = deckColumns(page);

		await page.getByRole('button', { name: 'Add column' }).first().click();
		await selectColumnType(page, 'timeline_search');
		const addDialog = page.getByRole('dialog', { name: 'Add column' });
		const searchInput = addDialog.getByLabel('Search query');
		const saveButton = addDialog.getByRole('button', { name: 'Save' });
		await expect(searchInput).toBeVisible();
		await expect(saveButton).toBeDisabled();

		await searchInput.fill('nostter');
		await expect(saveButton).toBeEnabled();
		await saveButton.click();

		const searchColumn = columns.first();
		await expectColumnOrder(columns, [...columnNames, 'Search']);
		await expect(searchColumn.getByText('Hello from a custom Nostr timeline')).toBeVisible();
		await expectStoredSearchColumn(page, 'nostter');
		await expect
			.poll(async () => fakeRelayConnectionCounts(page, searchRelays))
			.toEqual(Object.fromEntries(searchRelays.map((relay) => [relay, 1])));
		await expect
			.poll(async () => page.evaluate(() => window.__nostterFakeRelaySearchRequests?.nostter ?? 0))
			.toBe(searchRelays.length);

		await columnOptionsButton(searchColumn).click();
		const editInput = searchColumn.getByLabel('Search query');
		await expect(editInput).toHaveValue('nostter');
		await editInput.fill('edited');
		await expect(
			page.evaluate(() => window.__nostterFakeRelaySearchRequests?.edited ?? 0)
		).resolves.toBe(0);
		await expect(
			searchColumn.getByText('Edited search result from a Nostr search relay')
		).toHaveCount(0);

		await searchColumn.getByRole('button', { name: 'Save' }).click();
		await expect(searchColumn.getByLabel('Search query')).toHaveCount(0);
		await expect(
			searchColumn.getByText('Edited search result from a Nostr search relay')
		).toBeVisible();
		await expectStoredSearchColumn(page, 'edited');
		await expect
			.poll(async () => page.evaluate(() => window.__nostterFakeRelaySearchRequests?.edited ?? 0))
			.toBe(searchRelays.length);

		await page.reload();
		await expectColumnOrder(columns, [...columnNames, 'Search']);
		await expect(
			searchColumn.getByText('Edited search result from a Nostr search relay')
		).toBeVisible();
		await expectStoredSearchColumn(page, 'edited');
	});

	test('adds and persists a channel preset column', async ({ page }) => {
		await installFakeNostrRelay(page);
		await openDeck(page);
		const columns = deckColumns(page);
		const channelId = '4'.repeat(64);

		await addPresetColumn(page, 'timeline_channel', { channelTarget: channelId });

		await expectColumnOrder(columns, [...columnNames, 'Channel']);
		await expectStoredChannelColumn(page, channelId);

		await page.reload();
		await expectColumnOrder(columns, [...columnNames, 'Channel']);
		await expectStoredChannelColumn(page, channelId);
	});

	test('changes and persists column title and icon', async ({ page }) => {
		await installFakeNostrRelay(page);
		await openDeck(page);
		const columns = deckColumns(page);

		await addPresetColumn(page, 'timeline_search');
		const searchColumn = columns.first();
		await expectColumnOrder(columns, ['Search']);

		await columnOptionsButton(searchColumn).click();
		await searchColumn.getByLabel('Column title').fill('My search');
		await expectColumnOrder(columns, ['My search']);

		const iconGroup = searchColumn.getByRole('group', { name: 'Column icon' });
		await expect(iconGroup.getByRole('button').first()).toHaveAttribute('aria-label', 'Default');
		await expect(iconGroup.getByRole('button', { name: 'Search' })).toHaveCount(0);
		await iconGroup.getByRole('button', { name: 'Radio' }).click();
		await expect(searchColumn.locator('header svg').first()).toHaveClass(/lucide-radio/);
		await expect(sidebarButtonIcon(page, 'My search')).toHaveClass(/lucide-radio/);
		await expectStoredFirstColumnDisplay(page, { title: 'My search', icon: 'radio' });

		await page.reload();
		await expectColumnOrder(columns, ['My search']);
		await expect(sidebarButtonIcon(page, 'My search')).toHaveClass(/lucide-radio/);
		await columnOptionsButton(searchColumn).click();
		await expect(searchColumn.getByLabel('Column title')).toHaveValue('My search');
		await expect(
			searchColumn
				.getByRole('group', { name: 'Column icon' })
				.getByRole('button', { name: 'Radio' })
		).toHaveAttribute('aria-pressed', 'true');

		await searchColumn.getByLabel('Column title').fill('   ');
		await expectColumnOrder(columns, ['Search']);
		await expectStoredFirstColumnDisplay(page, { icon: 'radio' });

		await searchColumn
			.getByRole('group', { name: 'Column icon' })
			.getByRole('button', { name: 'Default' })
			.click();
		await expect(sidebarButtonIcon(page, 'Search')).toHaveClass(/lucide-search/);
		await expectStoredFirstColumnDisplay(page, {});
	});

	test('adds and persists a custom timeline column', async ({ page }) => {
		await installFakeNostrRelay(page);
		await openDeck(page);
		await page.route(imagePreviewUrl, async (route) => {
			await route.fulfill({
				status: 200,
				headers: { 'Content-Type': 'image/svg+xml' },
				body: route.request().method() === 'HEAD' ? undefined : tallPreviewSvg
			});
		});
		for (const url of [linkPreviewUrl, pathPreviewUrl]) {
			await page.route(url, async (route) => {
				await route.fulfill({
					status: 200,
					headers: { 'Content-Type': 'text/html' },
					body:
						route.request().method() === 'HEAD'
							? undefined
							: '<!doctype html><title>Example</title>'
				});
			});
		}
		const columns = deckColumns(page);

		await page.getByRole('button', { name: 'Add column' }).first().click();
		await expect(page.getByLabel('REQ filters')).toHaveCount(0);

		await selectColumnType(page, 'custom_timeline');
		const saveButton = page.getByRole('button', { name: 'Save' });
		const filtersInput = page.getByLabel('REQ filters');
		const customRelaysInput = page.getByLabel('Custom relays');
		await expect(filtersInput).toBeVisible();
		await expect(filtersInput).toHaveValue('[{"kinds":[1],"limit":20}]');
		await expect(page.getByText(/kind:pubkey:identifier/)).toHaveCount(0);
		await page.getByRole('button', { name: /kind:pubkey:identifier/ }).click();
		await expect(page.getByText(/kind:pubkey:identifier/)).toBeVisible();
		await page.keyboard.press('Escape');
		await expect(page.getByText(/kind:pubkey:identifier/)).toHaveCount(0);
		await expect(page.getByLabel('wss://relay.damus.io/')).toBeChecked();
		await expect(page.getByLabel('wss://nos.lol/')).toBeChecked();
		await expect(customRelaysInput).toHaveValue('');
		await expect(saveButton).toBeEnabled();

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
		await expect(customColumn.getByText('Alice Relay', { exact: true }).first()).toBeVisible();
		const profileAvatar = customColumn.getByTestId('post-avatar').first();
		await expect(profileAvatar).toBeVisible();
		await profileAvatar.dispatchEvent('error');
		await expect(profileAvatar.locator('img')).toHaveCount(0);
		await expect(profileAvatar).toHaveText('A');
		await expect(profileAvatar).toHaveClass(/rounded-full/);
		await expect(customColumn.getByText('#nostter')).toHaveCount(1);
		await expect(customColumn.getByText('Hello from a custom Nostr timeline')).toHaveCount(1);
		const postArticle = customColumn.locator('article').first();
		const imagePreviews = postArticle.locator(
			`button[data-testid="url-preview"][data-url="${imagePreviewUrl}"]`
		);
		await expect(imagePreviews).toHaveCount(2);
		await expect(imagePreviews.first().locator(`img[src="${imagePreviewUrl}"]`)).toBeVisible();
		const linkPreview = postArticle.locator(
			`a[data-testid="url-preview"][href="${linkPreviewUrl}"]`
		);
		const pathPreview = postArticle.locator(
			`a[data-testid="url-preview"][href="${pathPreviewUrl}"]`
		);
		await expect(linkPreview).toBeVisible();
		await expect(pathPreview).toBeVisible();
		await expect(pathPreview).toHaveAttribute('target', '_blank');
		await expect(pathPreview).toHaveAttribute('rel', 'external noopener noreferrer');
		await expect(pathPreview).toContainText('Example');
		const imagePreviewBox = await imagePreviews.first().boundingBox();
		const imageBox = await imagePreviews.first().locator('img').boundingBox();
		const linkPreviewBox = await linkPreview.boundingBox();
		expect(imagePreviewBox).not.toBeNull();
		expect(imageBox).not.toBeNull();
		expect(linkPreviewBox).not.toBeNull();
		expect(Math.abs(imagePreviewBox!.width - imageBox!.width)).toBeLessThanOrEqual(2);
		expect(Math.abs(imagePreviewBox!.height - imageBox!.height)).toBeLessThanOrEqual(2);
		expect(imagePreviewBox!.height).toBeGreaterThan(180);
		expect(imagePreviewBox!.width / imagePreviewBox!.height).toBeCloseTo(0.5, 1);
		expect(linkPreviewBox!.height).toBe(192);
		await expect
			.poll(async () => {
				const [imagePreviewWidth, linkPreviewWidth] = await Promise.all([
					imagePreviews.first().evaluate((element) => element.clientWidth),
					linkPreview.evaluate((element) => element.clientWidth)
				]);
				return imagePreviewWidth < linkPreviewWidth;
			})
			.toBe(true);
		await imagePreviews.first().click();
		const imageViewer = page.getByRole('dialog', { name: 'Image viewer' });
		await expect(imageViewer).toBeVisible();
		await expect(imageViewer.getByText('1 of 2')).toBeVisible();
		await expect(imageViewer.locator(`img[src="${imagePreviewUrl}"]`)).toBeVisible();
		await expect(imageViewer.getByRole('button', { name: 'Previous image' })).toBeHidden();
		await expect(imageViewer.getByRole('button', { name: 'Next image' })).toBeVisible();
		await expect(imageViewer.getByRole('link', { name: 'Open original image' })).toHaveAttribute(
			'href',
			imagePreviewUrl
		);
		await expect(imageViewer.getByRole('link', { name: 'Open original image' })).toHaveAttribute(
			'target',
			'_blank'
		);
		await imageViewer.getByRole('button', { name: 'Next image' }).click();
		await expect(imageViewer.getByText('2 of 2')).toBeVisible();
		await page.keyboard.press('ArrowLeft');
		await expect(imageViewer.getByText('1 of 2')).toBeVisible();
		const swipeArea = imageViewer.getByRole('group', { name: 'Image viewer' });
		await swipeArea.evaluate((element) => {
			for (const [type, clientX] of [
				['touchstart', 300],
				['touchend', 100]
			] as const) {
				const event = new Event(type, { bubbles: true });
				Object.defineProperty(event, 'changedTouches', { value: [{ clientX }] });
				element.dispatchEvent(event);
			}
		});
		await expect(imageViewer.getByText('2 of 2')).toBeVisible();
		await page.keyboard.press('Escape');
		await expect(imageViewer).toBeHidden();
		await expect(postArticle.getByRole('link', { name: 'www.example.com' })).toHaveCount(0);
		await expect(postArticle.getByRole('link', { name: /^npub/ })).toHaveCount(0);
		await expect(postArticle.getByRole('button', { name: 'Show more' })).toHaveCount(0);
		const nostrReferenceArticle = customColumn
			.locator('article')
			.filter({ hasText: 'NIP-21 references' });
		for (const nostrUri of [nostrNpub, nostrNprofile]) {
			await expect(nostrReferenceArticle.locator(`a[href="${nostrUri}"]`)).toHaveText(
				'@Alice Relay'
			);
		}
		await expect(nostrReferenceArticle.locator(`a[href="${nostrFallbackNpub}"]`)).toHaveText(
			'@npub1lllllll'
		);
		const quoteCards = nostrReferenceArticle.getByTestId('nostr-quote');
		await expect(quoteCards).toHaveCount(4);
		await expect(quoteCards.filter({ hasText: 'Quoted short text note' })).toHaveCount(2);
		await expect(quoteCards.filter({ hasText: 'Quoted channel message' })).toHaveCount(1);
		await expect(quoteCards.filter({ hasText: 'nostr:nevent1qqsrx' })).toHaveCount(1);
		await expect
			.poll(async () =>
				quoteCards.evaluateAll((cards) => cards.map((card) => card.getBoundingClientRect().height))
			)
			.toEqual([112, 112, 112, 112]);
		await expect(nostrReferenceArticle.locator(`a[href="${nostrNote}"]`)).toHaveCount(1);
		await expect(nostrReferenceArticle.locator(`a[href="${nostrNevent}"]`)).toHaveCount(1);
		await expect(nostrReferenceArticle.locator(`a[href="${nostrNaddr}"]`)).toHaveText(nostrNaddr);
		await expect
			.poll(() =>
				page.evaluate(
					(eventId) => window.__nostterFakeRelayEventIdRequests?.[eventId] ?? 0,
					'1'.repeat(64)
				)
			)
			.toBe(3);
		const longPostArticle = customColumn
			.locator('article')
			.filter({ hasText: 'Long post starts here' });
		const longPostBody = longPostArticle.getByTestId('post-body');
		await expect(longPostArticle.getByRole('button', { name: 'Show more' })).toBeVisible();
		const collapsedBodyHeight = await longPostBody.evaluate((element) => element.clientHeight);
		expect(collapsedBodyHeight).toBeLessThanOrEqual(192);
		await longPostArticle.getByRole('button', { name: 'Show more' }).click();
		await expect(longPostArticle.getByRole('button', { name: 'Show less' })).toBeVisible();
		await expect
			.poll(async () => longPostBody.evaluate((element) => element.clientHeight))
			.toBeGreaterThan(collapsedBodyHeight);
		await longPostArticle.getByRole('button', { name: 'Show less' }).click();
		await expect(longPostArticle.getByRole('button', { name: 'Show more' })).toBeVisible();
		await expect
			.poll(async () => longPostBody.evaluate((element) => element.clientHeight))
			.toBeLessThanOrEqual(192);
		await expect(postArticle.getByRole('button', { name: 'Column options' })).toHaveCount(0);
		await expect(postArticle.getByRole('button', { name: 'Reply' })).toHaveCount(0);
		await expect(postArticle.getByRole('button', { name: 'Repost' })).toHaveCount(0);
		await expect(postArticle.getByRole('button', { name: 'Like' })).toHaveCount(0);
		await expect(postArticle.getByRole('button', { name: 'Share' })).toHaveCount(0);
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
			{ kinds: [ShortTextNote], limit: 2 },
			{ kinds: [Repost], limit: 2 },
			{ kinds: [Reaction], limit: 2 }
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
			JSON.stringify([{ kinds: [ShortTextNote], limit: 20 }], null, 2)
		);
		await customColumn.getByRole('button', { name: /kind:pubkey:identifier/ }).click();
		await expect(page.getByText(/kind:pubkey:identifier/)).toBeVisible();
		await page.keyboard.press('Escape');
		await expect(page.getByText(/kind:pubkey:identifier/)).toHaveCount(0);
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
			[{ kinds: [ShortTextNote], limit: 20 }],
			initialRelaySelection
		);

		await columnOptionsButton(customColumn).click();
		await expect(customColumn.getByLabel('wss://relay.damus.io/')).toBeChecked();
		await expect(customColumn.getByLabel('wss://nos.lol/')).not.toBeChecked();
		await expect(editedCustomRelaysInput).toHaveValue('wss://relay.example.com/');

		await editedFiltersInput.fill(JSON.stringify({ kinds: [ShortTextNote], limit: 2 }));
		await expect(filterSaveButton).toBeDisabled();
		await expect(customColumn.getByText('Hello from a custom Nostr timeline')).toBeVisible();
		await expectStoredCustomTimelineColumn(
			page,
			[{ kinds: [ShortTextNote], limit: 20 }],
			initialRelaySelection
		);

		await editedFiltersInput.fill(JSON.stringify(savedFilters, null, 2));
		await editedCustomRelaysInput.fill('https://relay.example.net');
		await expect(filterSaveButton).toBeDisabled();
		await expect(customColumn.getByText('Hello from a custom Nostr timeline')).toBeVisible();
		await expectStoredCustomTimelineColumn(
			page,
			[{ kinds: [ShortTextNote], limit: 20 }],
			initialRelaySelection
		);

		await editedFiltersInput.fill(JSON.stringify(savedFilters, null, 2));
		await customColumn.getByLabel('wss://relay.damus.io/').setChecked(false);
		await customColumn.getByLabel('wss://nos.lol/').setChecked(true);
		await editedCustomRelaysInput.fill('wss://relay.example.net');
		await expect(filterSaveButton).toBeEnabled();
		await expectStoredCustomTimelineColumn(
			page,
			[{ kinds: [ShortTextNote], limit: 20 }],
			initialRelaySelection
		);

		await filterSaveButton.click();
		await expect(editedFiltersInput).toBeHidden();
		await expect(
			customColumn.getByText('Hello from a custom Nostr timeline').first()
		).toBeVisible();
		await expect(customColumn.getByText('Alice Relay reposted')).toHaveCount(2);
		await expect(customColumn.getByText('Alice Relay liked')).toBeVisible();
		await expect(customColumn.getByText('Repost from a custom Nostr timeline')).toHaveCount(0);
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
		await expect(
			columns.first().getByText('Hello from a custom Nostr timeline').first()
		).toBeVisible();

		await page.getByRole('button', { name: 'Add column' }).first().click();
		await selectColumnType(page, 'custom_timeline');
		await page
			.getByRole('dialog', { name: 'Add column' })
			.getByRole('button', { name: 'Save' })
			.click();
		await expectColumnOrder(columns, [...columnNames, 'Custom timeline', 'Custom timeline']);
		await expect
			.poll(async () => fakeRelayConnectionCounts(page, expectedProfileRelayUrls))
			.toEqual(expectedProfileRelayConnections);
	});

	test('batches profile requests for timeline event authors', async ({ page }) => {
		await installFakeNostrRelay(page);
		await openDeck(page);
		const columns = deckColumns(page);
		const profileAuthorsKey = [textEventPubkey, staleContactPubkey].sort().join(',');

		await addCustomTimelineColumn(page, {
			filters: [
				{ kinds: [ShortTextNote], authors: [textEventPubkey, staleContactPubkey], limit: 20 }
			]
		});

		await expect(columns.first().getByText('Hello from a custom Nostr timeline')).toBeVisible();
		await expect(columns.first().getByText('Hello from a stale contact list')).toBeVisible();
		await expect
			.poll(async () =>
				page.evaluate(
					(key) => window.__nostterFakeRelayProfileAuthorRequests?.[key] ?? 0,
					profileAuthorsKey
				)
			)
			.toBe(expectedProfileRelayRequestCount);
	});

	test('shows NIP-18 reposts from custom timelines', async ({ page }) => {
		await installFakeNostrRelay(page);
		await openDeck(page);
		const columns = deckColumns(page);

		await addCustomTimelineColumn(page, {
			filters: [{ kinds: [Repost], limit: 20 }]
		});

		const customColumn = columns.first();
		await expect(customColumn.getByText('Alice Relay reposted')).toHaveCount(2);
		await expect(customColumn.getByText('Hello from a custom Nostr timeline')).toHaveCount(2);
		await expect(customColumn.getByText('Repost from a custom Nostr timeline')).toHaveCount(0);
		await expect
			.poll(async () =>
				page.evaluate(
					() => window.__nostterFakeRelayEventIdRequests?.['event-custom-timeline-1'] ?? 0
				)
			)
			.toBeGreaterThan(0);
	});

	test('keeps a bounded timeline window backed by IndexedDB', async ({ page }) => {
		await installFakeNostrRelay(page);
		await openDeck(page);
		const columns = deckColumns(page);

		await addCustomTimelineColumn(page, {
			filters: [{ kinds: [ShortTextNote], search: 'bulk', limit: 250 }]
		});

		const customColumn = columns.first();
		const timelineScroll = customColumn.getByTestId('timeline-scroll');
		await expect(customColumn.locator('article')).toHaveCount(200);

		await timelineScroll.evaluate((element) => {
			element.scrollTop = element.scrollHeight;
			element.dispatchEvent(new Event('scroll'));
		});
		await expect(customColumn.getByText('Bulk event 249')).toBeVisible();
		await expect(customColumn.locator('article')).toHaveCount(200);
		await expect(customColumn.getByText('Bulk event 000')).toHaveCount(0);

		await timelineScroll.evaluate((element) => {
			element.scrollTop = 0;
		});
		await expect(customColumn.getByText('Bulk event 000')).toBeVisible();
		await expect(customColumn.locator('article')).toHaveCount(200);
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
			{ kinds: [ShortTextNote], authors: contactListAddress },
			{ kinds: [ShortTextNote], authors: emptyAddressableListAddress },
			{ kinds: [ShortTextNote], authors: namedAddressableListAddress }
		];

		await page.getByRole('button', { name: 'Add column' }).first().click();
		await selectColumnType(page, 'custom_timeline');

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
		await installFakeNostrRelay(page);
		await openDeck(page);
		const columns = deckColumns(page);

		await addPresetColumn(page, 'timeline_search');
		await addWebsiteColumn(page, 'example.com');

		await expectColumnOrder(columns, ['Search', 'example.com']);
		await expectColumnWidth(columns.first(), standardColumnWidth);
		await expectColumnWidth(columns.nth(1), standardColumnWidth);

		await columnOptionsButton(columns.first()).click();
		const widthSelect = columns.first().getByLabel('Column width');
		await expect(widthSelect).toHaveText('Standard');
		await widthSelect.click();
		await expect(page.getByRole('option')).toHaveText(['Wide', 'Standard', 'Narrow']);

		await page.getByRole('option', { name: 'Wide', exact: true }).click();
		await expectColumnWidth(columns.first(), wideColumnWidth);
		await expectColumnWidth(columns.nth(1), standardColumnWidth);
		await expectStoredColumnConfigWidths(page, ['wide', 'standard']);

		await page.reload();
		await expectColumnOrder(columns, ['Search', 'example.com']);
		await expectColumnWidth(columns.first(), wideColumnWidth);
		await expectColumnWidth(columns.nth(1), standardColumnWidth);
		await columnOptionsButton(columns.first()).click();
		await expect(columns.first().getByLabel('Column width')).toHaveText('Wide');

		await selectDropdownOption(page, columns.first().getByLabel('Column width'), 'Narrow');
		await expectColumnWidth(columns.first(), narrowColumnWidth);
		await expectStoredColumnConfigWidths(page, ['narrow', 'standard']);
	});

	test('persists column changes across reloads', async ({ page }) => {
		await installFakeNostrRelay(page);
		await openDeck(page);
		const columns = deckColumns(page);

		await addPresetColumn(page, 'timeline_search');
		await addWebsiteColumn(page, 'example.com');
		await expectColumnOrder(columns, ['Search', 'example.com']);
		await expectColumnWidth(columns.nth(1), standardColumnWidth);

		await columnOptionsButton(columns.nth(1)).click();
		await selectDropdownOption(page, columns.nth(1).getByLabel('Column width'), 'Wide');
		await columns.nth(1).getByRole('button', { name: 'Move column left' }).click();
		await expectColumnOrder(columns, ['example.com', 'Search']);
		await expectStoredColumnConfigWidths(page, ['wide', 'standard']);

		await page.reload();
		await expectColumnOrder(columns, ['example.com', 'Search']);
		await expectColumnWidth(columns.first(), wideColumnWidth);

		await columnOptionsButton(columns.first()).click();
		await columns.first().getByRole('button', { name: 'Delete column' }).click();
		await page.reload();
		await expectColumnOrder(columns, ['Search']);
	});

	test('collapses and expands the sidebar', async ({ page }) => {
		await installFakeNostrRelay(page);
		await openDeck(page);

		await addPresetColumn(page, 'timeline_search');
		await addWebsiteColumn(page, 'example.com');

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
			'example.com',
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

	test('changes language from the settings dialog', async ({ page }) => {
		await openDeck(page);

		await expect(sidebar(page).getByText('Language')).toHaveCount(0);

		await page.getByRole('button', { name: 'Settings' }).click();
		await expect(page.getByRole('dialog', { name: 'Settings' })).toBeVisible();
		await expect(page.getByLabel('Language')).toHaveText('EN');

		await selectDropdownOption(page, page.getByLabel('Language'), 'JA');
		await expect(sidebar(page).getByRole('button', { name: '設定', exact: true })).toBeVisible();

		await sidebar(page).getByRole('button', { name: '設定', exact: true }).click();
		await expect(page.getByRole('dialog', { name: '設定' })).toBeVisible();
		await expect(page.getByLabel('言語')).toHaveText('JA');

		await selectDropdownOption(page, page.getByLabel('言語'), 'EN');
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
		await expect(page.getByLabel('Theme')).toHaveText('System');
		await expect(page.getByLabel('Font size')).toHaveText('Standard');

		await selectDropdownOption(page, page.getByLabel('Theme'), 'Dark');
		await expect(page.locator('html')).toHaveClass(/dark/);
		await expectStoredThemePreference(page, 'dark');
		await expectThemeNotStoredInUiState(page);
		await expect(page.locator('main')).toHaveCSS('color-scheme', 'dark');

		await page.reload();
		await expect(page.locator('html')).toHaveClass(/dark/);
		await page.getByRole('button', { name: 'Settings' }).click();
		await expect(page.getByLabel('Theme')).toHaveText('Dark');

		await selectDropdownOption(page, page.getByLabel('Theme'), 'Light');
		await expect(page.locator('html')).not.toHaveClass(/dark/);
		await expectStoredThemePreference(page, 'light');
		await expectThemeNotStoredInUiState(page);
	});

	test('changes and persists the font size from user settings', async ({ page }) => {
		await installFakeNostrRelay(page);
		await openDeck(page);
		await addCustomTimelineColumn(page);

		const postBody = page.getByText('Hello from a custom Nostr timeline');
		const mediumFontSize = await fontSizePx(postBody);

		await page.getByRole('button', { name: 'Settings' }).click();
		const fontSizeSelect = page.getByLabel('Font size');
		const fontSizeLabel = page.getByText('Font size');
		const mediumSettingsFontSize = await fontSizePx(fontSizeLabel);

		await expect(fontSizeSelect).toHaveText('Standard');
		await fontSizeSelect.click();
		await expect(page.getByRole('option')).toHaveText(['Larger', 'Standard', 'Smaller']);

		await page.getByRole('option', { name: 'Smaller', exact: true }).click();
		await expectStoredFontSize(page, 'small');
		await expectFontSizeNotStoredInUiState(page);
		await expect.poll(() => fontSizePx(postBody)).toBeLessThan(mediumFontSize);
		await expect.poll(() => fontSizePx(fontSizeLabel)).toBeLessThan(mediumSettingsFontSize);

		await selectDropdownOption(page, fontSizeSelect, 'Larger');
		await expectStoredFontSize(page, 'large');
		await expect.poll(() => fontSizePx(postBody)).toBeGreaterThan(mediumFontSize);
		await expect.poll(() => fontSizePx(fontSizeLabel)).toBeGreaterThan(mediumSettingsFontSize);

		await page.reload();
		await page.getByRole('button', { name: 'Settings' }).click();
		await expect(page.getByLabel('Font size')).toHaveText('Larger');
		await expectStoredFontSize(page, 'large');
	});

	test('changes and persists the profile icon shape from user settings', async ({ page }) => {
		await installFakeNostrRelay(page);
		await openDeck(page, { isLoggedIn: true });
		await addCustomTimelineColumn(page);

		const postAvatar = page.getByTestId('post-avatar').first();
		const sidebarAvatar = sidebar(page).getByTestId('account-avatar').first();
		const postArticle = page.locator('article').first();
		await expect(postAvatar).toHaveClass(/rounded-full/);
		await expect(sidebarAvatar).toHaveClass(/rounded-full/);
		await expect(postArticle.getByRole('button', { name: 'Column options' })).toBeVisible();
		await expect(postArticle.getByRole('button', { name: 'Reply' })).toBeVisible();
		await expect(postArticle.getByRole('button', { name: 'Repost' })).toBeVisible();
		await expect(postArticle.getByRole('button', { name: 'Like' })).toBeVisible();
		await expect(postArticle.getByRole('button', { name: 'Share' })).toBeVisible();

		await page.getByRole('button', { name: 'Settings' }).click();
		const avatarShapeSelect = page.getByLabel('Profile icon');
		await expect(avatarShapeSelect).toHaveText('Circle');
		await avatarShapeSelect.click();
		await expect(page.getByRole('option')).toHaveText(['Circle', 'Square']);

		await page.getByRole('option', { name: 'Square', exact: true }).click();
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
		await expect(page.getByLabel('Profile icon')).toHaveText('Square');
		await expectStoredAvatarShape(page, 'square');
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
