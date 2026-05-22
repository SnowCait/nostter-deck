import { expect, test, type Locator, type Page } from '@playwright/test';

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
const sidebarCenterTolerance = 1;

async function openDeck(page: Page) {
	await page.addInitScript(() => {
		if (!window.localStorage.getItem('PARAGLIDE_LOCALE')) {
			window.localStorage.setItem('PARAGLIDE_LOCALE', 'en');
		}
	});
	await page.goto('/');
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

async function expectColumnOrder(columns: Locator, names: string[]) {
	await expect(columns).toHaveCount(names.length);
	await expect(columns.locator('header h2')).toHaveText(names);
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
		await expectSidebarIconsCentered(page, [...sidebarButtonNames, 'Expand sidebar']);
		expect(
			Math.abs((await iconCenterX(page, 'Expand sidebar')) - expandedIconCenterX)
		).toBeLessThanOrEqual(sidebarCenterTolerance);

		await expandButton.click();
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
});
