import { expect, test, type Page } from '@playwright/test';
import type { Filter } from 'nostr-tools/filter';
import { RelayList, Repost, ShortTextNote } from 'nostr-tools/kinds';
import { npubEncode } from 'nostr-tools/nip19';
import { defaultRelays } from '$lib/nostr/relays';
import { columnOptionsButton, deckColumns, openDeck, readStoredColumns } from './helpers/deck-page';

const target = 'a'.repeat(64);
const other = 'b'.repeat(64);
const referencedId = 'c'.repeat(64);
const readRelay = 'wss://user-posts-read.example/';
const writeRelay = 'wss://user-posts-write.example/';
const customRelay = 'wss://user-posts-custom.example/';
const targetRelayLabel = "Target user's relays (recommended)";

async function openAddUserPosts(page: Page) {
	await page.getByRole('button', { name: 'Add column' }).first().click();
	const dialog = page.getByRole('dialog', { name: 'Add column' });
	await dialog.getByRole('radio', { name: 'User Posts', exact: true }).locator('..').click();
	return dialog;
}

test('uses target write relays and persists independent User Posts settings', async ({ page }) => {
	await page.addInitScript(() => {
		window.__NOSTTER_DECK_SKIP_NOSTR_VERIFY__ = true;
	});

	const timestamp = Math.floor(Date.now() / 1000) - 60;
	function event(
		id: string,
		pubkey: string,
		content: string,
		tags: string[][],
		kind = ShortTextNote
	) {
		return { id, pubkey, content, tags, kind, created_at: timestamp, sig: '0'.repeat(128) };
	}
	const relayList = event(
		'e'.repeat(64),
		target,
		'',
		[
			['r', readRelay, 'read'],
			['r', writeRelay, 'write']
		],
		RelayList
	);
	const referenced = event(referencedId, other, 'Reposted body', []);
	const posts = [
		event('1'.repeat(64), target, 'Quote from target', [['q', referencedId]]),
		event('2'.repeat(64), target, 'Reply from target', [['e', referencedId, '', 'root']]),
		event(
			'3'.repeat(64),
			target,
			'',
			[
				['e', referencedId],
				['p', other]
			],
			Repost
		)
	];
	const requests: Array<{ relay: string; pubkey: string }> = [];
	await page.routeWebSocket(/.*/, (socket) => {
		socket.onMessage((message) => {
			const [type, id, ...filters] = JSON.parse(String(message)) as [string, string, ...Filter[]];
			if (type !== 'REQ') {
				return;
			}
			for (const filter of filters) {
				const send = (source: ReturnType<typeof event>) =>
					socket.send(JSON.stringify(['EVENT', id, source]));
				if (filter.kinds?.includes(RelayList) && filter.authors?.includes(target)) {
					send(relayList);
				}
				if (filter.ids?.includes(referencedId)) {
					send(referenced);
				}
				if (filter.kinds?.includes(ShortTextNote) && filter.kinds.includes(Repost)) {
					for (const pubkey of filter.authors ?? []) {
						requests.push({ relay: socket.url(), pubkey });
						if (pubkey === target && (filter.since ?? 0) <= timestamp) {
							for (const post of posts) {
								send(post);
							}
						}
					}
				}
			}
			socket.send(JSON.stringify(['EOSE', id]));
		});
	});

	await openDeck(page);
	const dialog = await openAddUserPosts(page);
	await expect(dialog.getByRole('radio', { name: targetRelayLabel })).toBeChecked();
	await expect(dialog.getByRole('radio', { name: 'Account', exact: true })).toHaveCount(0);
	await expect(dialog.getByLabel('Include replies')).toHaveCount(0);
	await expect(dialog.getByLabel('Include reposts')).toHaveCount(0);
	const input = dialog.getByLabel('Target user public key');
	const save = dialog.getByRole('button', { name: 'Save' });
	await input.fill('invalid key');
	await expect(save).toBeDisabled();
	await input.fill(npubEncode(target));
	await save.click();
	const first = deckColumns(page).first();
	await expect
		.poll(() => readStoredColumns(page))
		.toEqual([expect.objectContaining({ includeReplies: true, includeReposts: true })]);
	await expect.poll(() => requests).toContainEqual({ relay: writeRelay, pubkey: target });
	expect(requests).not.toContainEqual({ relay: readRelay, pubkey: target });
	await expect(first.getByText('Quote from target', { exact: true })).toBeVisible();
	await expect(first.getByText('Reply from target', { exact: true })).toBeVisible();
	await expect(first.getByText('Reposted body', { exact: true })).toBeVisible();

	await columnOptionsButton(first).click();
	await first.getByLabel('Include replies').uncheck();
	await first.getByRole('button', { name: 'Save' }).click();
	await expect(first.getByText('Reply from target', { exact: true })).toHaveCount(0);
	await expect(first.getByText('Reposted body', { exact: true })).toBeVisible();
	await expect(first.getByText('Quote from target', { exact: true })).toBeVisible();

	await openAddUserPosts(page);
	await input.fill(other);
	await save.click();
	const second = deckColumns(page).nth(1);
	await expect
		.poll(() =>
			requests.some(
				({ relay, pubkey }) =>
					pubkey === other && defaultRelays.some((fallback) => fallback === relay)
			)
		)
		.toBe(true);
	await columnOptionsButton(second).click();
	await second.getByRole('radio', { name: 'Custom relays', exact: true }).locator('..').click();
	await expect(second.getByRole('checkbox', { name: defaultRelays[0] })).not.toBeChecked();
	await second.getByRole('textbox', { name: 'Custom relays' }).fill(customRelay);
	await second.getByLabel('Target user public key').fill(target);
	await second.getByLabel('Include reposts').uncheck();
	await second.getByRole('button', { name: 'Save' }).click();
	await expect.poll(() => requests).toContainEqual({ relay: customRelay, pubkey: target });
	await expect(second.getByText('Reply from target', { exact: true })).toBeVisible();
	await expect(second.getByText('Reposted body', { exact: true })).toHaveCount(0);

	await page.reload();
	await expect(deckColumns(page)).toHaveCount(2);
	await expect
		.poll(() => readStoredColumns(page))
		.toEqual([
			expect.objectContaining({
				sourceKey: 'timeline_user_posts',
				pubkey: target,
				includeReplies: false,
				includeReposts: true,
				relays: { type: 'nip65', pubkey: target }
			}),
			expect.objectContaining({
				sourceKey: 'timeline_user_posts',
				pubkey: target,
				includeReplies: true,
				includeReposts: false,
				relays: { type: 'custom', urls: [customRelay] }
			})
		]);
	await expect(first.getByRole('heading')).toHaveText(
		`User Posts: ${npubEncode(target).slice(0, 12)}`
	);
	await expect(second.getByText('Reply from target', { exact: true })).toBeVisible();
});
