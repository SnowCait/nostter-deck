import { expect, test, type Locator } from '@playwright/test';
import type { Filter } from 'nostr-tools/filter';
import { Metadata, Reaction, Repost, ShortTextNote } from 'nostr-tools/kinds';
import { noteEncode } from 'nostr-tools/nip19';
import {
	addCustomTimelineColumn,
	columnOptionsButton,
	deckColumns,
	openDeck,
	selectDropdownOption,
	userSettingsStorageKey
} from './helpers/deck-page';

test.use({ timezoneId: 'Asia/Tokyo' });

test('updates post and quote timestamps at midnight and on appearance changes', async ({
	page
}) => {
	await page.clock.install({ time: new Date('2026-12-31T23:58:00+09:00') });
	await page.addInitScript((key) => {
		window.__NOSTTER_DECK_SKIP_NOSTR_VERIFY__ = true;
		if (!localStorage.getItem(key)) {
			localStorage.setItem(key, JSON.stringify({ fontSize: 'large' }));
		}
	}, userSettingsStorageKey);

	const pubkey = 'a'.repeat(64);
	const author = 'A very long display name '.repeat(6).trim();
	function event(id: string, time: string, kind: number, content: string, tags: string[][] = []) {
		return {
			id: id.repeat(64),
			pubkey,
			created_at: Date.parse(time) / 1000,
			kind,
			content,
			tags,
			sig: '0'.repeat(128)
		};
	}

	const quoted = event('1', '2025-11-23T18:30:00+09:00', ShortTextNote, 'Quoted body');
	const post = event(
		'2',
		'2026-12-31T23:55:00+09:00',
		ShortTextNote,
		`Quote source nostr:${noteEncode(quoted.id)}`
	);
	const repost = event('3', '2026-12-31T23:56:00+09:00', Repost, '', [
		['e', quoted.id],
		['p', pubkey]
	]);
	const reaction = event('4', '2026-12-31T23:57:00+09:00', Reaction, '+', [
		['e', quoted.id],
		['p', pubkey]
	]);
	const profile = event(
		'5',
		'2026-12-31T22:00:00+09:00',
		Metadata,
		JSON.stringify({ display_name: author })
	);

	await page.routeWebSocket(/.*/, (socket) => {
		socket.onMessage((message) => {
			const [type, id, ...filters] = JSON.parse(String(message)) as [string, string, ...Filter[]];
			if (type !== 'REQ') {
				return;
			}
			for (const filter of filters) {
				const candidates = filter.ids
					? [quoted]
					: filter.kinds?.includes(Metadata)
						? [profile]
						: [post, repost, reaction];
				for (const source of candidates) {
					if (
						(filter.ids && !filter.ids.includes(source.id)) ||
						(filter.kinds && !filter.kinds.includes(source.kind)) ||
						(filter.authors && !filter.authors.includes(source.pubkey)) ||
						(filter.since ?? 0) > source.created_at
					) {
						continue;
					}
					socket.send(JSON.stringify(['EVENT', id, source]));
				}
			}
			socket.send(JSON.stringify(['EOSE', id]));
		});
	});

	await openDeck(page);
	await addCustomTimelineColumn(page, {
		filters: [{ kinds: [ShortTextNote, Repost, Reaction], limit: 20 }]
	});
	const column = deckColumns(page).first();
	const row = (id: string) => column.locator(`[data-post-key="${id}"]`);
	const mainPost = row(post.id);
	const mainTime = mainPost.locator('time').first();
	const quote = mainPost.getByTestId('nostr-quote');
	const quoteTime = quote.locator('time');
	await expect(mainTime).toHaveText(/^11:55\s*PM$/);
	await expect(quoteTime).toHaveText(/^11\/23\/2025.*6:30\s*PM$/);
	await expect(row(repost.id).locator('time')).toHaveAttribute(
		'datetime',
		new Date(repost.created_at * 1000).toISOString()
	);
	await expect(row(reaction.id).locator('time')).toHaveAttribute(
		'datetime',
		new Date(reaction.created_at * 1000).toISOString()
	);

	await columnOptionsButton(column).click();
	await selectDropdownOption(page, column.getByLabel('Column width'), 'Narrow');
	await columnOptionsButton(column).click();
	const authorButton = mainPost
		.getByRole('button', { name: `Open ${author}'s profile`, exact: true })
		.last();
	await expect(authorButton).toBeVisible();
	await expect(quote.getByText(author, { exact: true })).toBeVisible();
	await expect
		.poll(async () => (await mainTime.boundingBox())!.y)
		.toBeGreaterThan((await authorButton.boundingBox())!.y);
	async function fits(container: Locator, timestamp: Locator) {
		const box = await container.boundingBox();
		const text = await timestamp.boundingBox();
		return Boolean(
			box &&
			text &&
			text.x + text.width <= box.x + box.width &&
			text.y + text.height <= box.y + box.height
		);
	}
	await expect.poll(() => fits(column, mainTime)).toBe(true);
	await expect.poll(() => fits(quote, quoteTime)).toBe(true);

	await page.clock.fastForward(3 * 60 * 1000);
	await expect(mainTime).toHaveText(/^12\/31\/2026.*11:55\s*PM$/);
	await expect.poll(() => fits(column, mainTime)).toBe(true);
	await page.getByRole('button', { name: 'Settings', exact: true }).click();
	const settings = page.getByRole('dialog', { name: 'Settings' });
	const mode = settings.getByLabel('Post timestamps');
	await expect(mode).toHaveText('Absolute');
	await expect(settings.getByLabel('Font size')).toHaveText('Larger');
	await selectDropdownOption(page, mode, 'Relative');
	await expect(mainTime).toHaveText(/^\d+m$/);
	await expect(quoteTime).toHaveText(/^\d+d$/);

	await page.reload();
	await expect(mainTime).toHaveText(/^\d+m$/);
});
