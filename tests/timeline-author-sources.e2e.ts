import { expect, test } from '@playwright/test';
import { Contacts, ShortTextNote } from 'nostr-tools/kinds';
import { npubEncode } from 'nostr-tools/nip19';
import type * as Nostr from 'nostr-typedef';
import { addPresetColumn, deckColumns, openDeck } from './helpers/deck-page';

test('a follow timeline displays cached authors before refresh and keeps their posts afterward', async ({
	page
}) => {
	const owner = 'a'.repeat(64);
	const oldAuthor = 'b'.repeat(64);
	const newAuthor = 'c'.repeat(64);
	const postRelay = 'wss://timeline.example/';
	const createdAt = Math.floor(Date.now() / 1000) - 60;
	const oldList = {
		id: '1'.repeat(64),
		kind: Contacts,
		pubkey: owner,
		created_at: createdAt - 10,
		tags: [['p', oldAuthor]],
		content: '',
		sig: '0'.repeat(128)
	};
	const newList = {
		...oldList,
		id: '2'.repeat(64),
		created_at: createdAt - 5,
		tags: [['p', newAuthor]]
	};
	const posts = [
		{
			id: '3'.repeat(64),
			kind: ShortTextNote,
			pubkey: oldAuthor,
			created_at: createdAt,
			tags: [],
			content: 'Post from the cached follow list',
			sig: '0'.repeat(128)
		},
		{
			id: '4'.repeat(64),
			kind: ShortTextNote,
			pubkey: newAuthor,
			created_at: createdAt + 1,
			tags: [],
			content: 'Post from the refreshed follow list',
			sig: '0'.repeat(128)
		}
	];
	const { promise: waitForRefresh, resolve: releaseRefresh } = Promise.withResolvers<void>();
	let refreshPending = false;
	let refreshRequested = false;

	await page.addInitScript(() => {
		window.__NOSTTER_DECK_SKIP_NOSTR_VERIFY__ = true;
	});
	await page.route(/^https:\/\//, async (route) => {
		if (route.request().headers().accept === 'application/nostr+json') {
			await route.fulfill({ json: {} });
		} else {
			await route.fallback();
		}
	});
	await page.routeWebSocket(/.*/, (socket) => {
		socket.onMessage(async (message) => {
			const [command, subscriptionId, ...filters] = JSON.parse(String(message)) as [
				string,
				string,
				...Nostr.Filter[]
			];
			if (command !== 'REQ') {
				return;
			}
			if (
				filters.some(({ kinds, authors }) => kinds?.includes(Contacts) && authors?.includes(owner))
			) {
				if (refreshPending) {
					refreshRequested = true;
					await waitForRefresh;
				}
				socket.send(JSON.stringify(['EVENT', subscriptionId, refreshPending ? newList : oldList]));
			}
			if (socket.url() === postRelay) {
				for (const post of posts) {
					if (
						filters.some(
							({ kinds, authors, until }) =>
								kinds?.includes(ShortTextNote) &&
								authors?.includes(post.pubkey) &&
								until !== undefined &&
								post.created_at <= until
						)
					) {
						socket.send(JSON.stringify(['EVENT', subscriptionId, post]));
					}
				}
			}
			socket.send(JSON.stringify(['EOSE', subscriptionId]));
		});
	});

	await openDeck(page);
	await addPresetColumn(page, 'timeline_follow', {
		followTarget: npubEncode(owner),
		customRelays: postRelay
	});
	const column = deckColumns(page).first();
	const oldPost = column.getByText(posts[0].content, { exact: true });
	const newPost = column.getByText(posts[1].content, { exact: true });
	await expect(oldPost).toBeVisible();

	refreshPending = true;
	await page.reload();
	await expect.poll(() => refreshRequested).toBe(true);
	await expect(oldPost).toBeVisible();
	await expect(newPost).toHaveCount(0);

	releaseRefresh();
	await expect(newPost).toBeVisible();
	await expect(oldPost).toBeVisible();
});
