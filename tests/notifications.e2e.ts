import { expect, test, type Page } from '@playwright/test';
import { defaultRelays } from '$lib/nostr/relays';
import { npubEncode } from 'nostr-tools/nip19';
import { columnOptionsButton, deckColumns, openDeck, readStoredColumns } from './helpers/deck-page';

const target = 'a'.repeat(64);
const other = 'b'.repeat(64);
const missingId = 'c'.repeat(64);
const mismatchedId = 'd'.repeat(64);
const readRelay = 'wss://notifications-read.example/';
const writeRelay = 'wss://notifications-write.example/';
const customRelay = 'wss://notifications-custom.example/';

async function addNotifications(page: Page, pubkey: string) {
	await page.getByRole('button', { name: 'Add column' }).first().click();
	const dialog = page.getByRole('dialog', { name: 'Add column' });
	await dialog.getByText('Notifications', { exact: true }).click();
	const input = dialog.getByLabel('Target user (npub)');
	const save = dialog.getByRole('button', { name: 'Save' });
	await input.fill(pubkey);
	await expect(save).toBeDisabled();
	await input.fill(npubEncode(pubkey));
	await save.click();
}

test('enriches notifications asynchronously and restores independent column settings', async ({
	page
}) => {
	await page.addInitScript(() => {
		window.__NOSTTER_DECK_SKIP_NOSTR_VERIFY__ = true;
	});

	const createdAt = Math.floor(Date.now() / 1000) - 60;
	function event(id: string, pubkey: string, content: string, tags: string[][], kind = 1) {
		return { id, pubkey, content, tags, kind, created_at: createdAt, sig: '0'.repeat(128) };
	}
	const relayList = event(
		'e'.repeat(64),
		target,
		'',
		[
			['r', readRelay, 'read'],
			['r', writeRelay, 'write']
		],
		10002
	);
	const mismatch = event(mismatchedId, other, 'Post by another user', []);
	const events = [
		event('1'.repeat(64), other, 'Unavailable quote', [
			['p', target],
			['q', missingId]
		]),
		event('2'.repeat(64), other, 'Provisional quote', [
			['p', target],
			['q', mismatchedId]
		]),
		event('3'.repeat(64), target, 'My reply and mention nostr:' + npubEncode(target), [
			['p', target],
			['e', missingId, '', 'reply']
		])
	];

	const timelineRequests: Array<{ relay: string; pubkey: string }> = [];
	const { promise: releaseMismatch, resolve: revealMismatch } = Promise.withResolvers<void>();
	await page.routeWebSocket(/.*/, (socket) => {
		socket.onMessage(async (message) => {
			const [operation, subscription, ...filters] = JSON.parse(String(message));
			if (operation !== 'REQ') {
				return;
			}
			for (const filter of filters) {
				if (filter.kinds?.includes(10002) && filter.authors?.includes(target)) {
					socket.send(JSON.stringify(['EVENT', subscription, relayList]));
				}
				if (filter.ids?.includes(mismatchedId)) {
					await releaseMismatch;
					socket.send(JSON.stringify(['EVENT', subscription, mismatch]));
				}
				for (const pubkey of filter['#p'] ?? []) {
					timelineRequests.push({ relay: socket.url(), pubkey });
					if (pubkey !== target || !filter.kinds?.includes(1) || filter.since > createdAt) {
						continue;
					}
					for (const source of events) {
						socket.send(JSON.stringify(['EVENT', subscription, source]));
					}
					socket.send(JSON.stringify(['EVENT', subscription, events[0]]));
				}
			}
			socket.send(JSON.stringify(['EOSE', subscription]));
		});
	});
	await openDeck(page);
	await addNotifications(page, target);
	const first = deckColumns(page).first();
	await expect
		.poll(() => readStoredColumns(page))
		.toEqual([expect.objectContaining({ includeOwnEvents: false })]);
	await expect.poll(() => timelineRequests).toContainEqual({ relay: readRelay, pubkey: target });
	expect(timelineRequests).not.toContainEqual({ relay: writeRelay, pubkey: target });
	await expect(first.getByText('Provisional quote', { exact: true })).toBeVisible();
	await expect(first.getByText('Unavailable quote', { exact: true })).toHaveCount(1);
	await expect(first.getByText('My reply and mention', { exact: false })).toHaveCount(0);

	revealMismatch();
	await expect(first.getByText('Provisional quote', { exact: true })).toHaveCount(0);
	await expect(first.getByText('Unavailable quote', { exact: true })).toBeVisible();

	await addNotifications(page, other);
	await expect
		.poll(() =>
			timelineRequests.some(
				({ pubkey, relay }) =>
					pubkey === other && defaultRelays.some((fallback) => fallback === relay)
			)
		)
		.toBe(true);
	await expect(deckColumns(page)).toHaveCount(2);
	await columnOptionsButton(first).click();
	const requestCount = timelineRequests.filter(({ pubkey }) => pubkey === target).length;
	await first.getByLabel('Include own events').check();
	await first.getByRole('button', { name: 'Save' }).click();
	await expect(first.getByText('My reply and mention', { exact: false })).toBeVisible();
	await expect(first.getByText('Reply', { exact: true })).toBeVisible();
	await expect(first.getByText('Mention', { exact: true })).toBeVisible();
	expect(timelineRequests.filter(({ pubkey }) => pubkey === target)).toHaveLength(requestCount);

	const second = deckColumns(page).nth(1);
	await columnOptionsButton(second).click();
	const newTarget = 'f'.repeat(64);
	await second.getByLabel('Target user (npub)').fill(npubEncode(newTarget));
	await second.getByText('Custom', { exact: true }).click();
	await second.getByLabel('Custom relays').fill(customRelay);
	await second.getByRole('button', { name: 'Save' }).click();
	await expect
		.poll(() => timelineRequests)
		.toContainEqual({ relay: customRelay, pubkey: newTarget });

	await page.reload();
	await expect(deckColumns(page)).toHaveCount(2);
	await expect
		.poll(() => readStoredColumns(page))
		.toEqual([
			expect.objectContaining({
				sourceKey: 'nav_notifications',
				pubkey: target,
				includeOwnEvents: true,
				relays: { type: 'nip65', pubkey: target }
			}),
			expect.objectContaining({
				sourceKey: 'nav_notifications',
				pubkey: newTarget,
				includeOwnEvents: false,
				relays: { type: 'custom', urls: expect.arrayContaining([customRelay]) }
			})
		]);
	await expect(first.getByText('My reply and mention', { exact: false })).toBeVisible();
});
