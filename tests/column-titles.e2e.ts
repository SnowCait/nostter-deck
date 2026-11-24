import { expect, test, type WebSocketRoute } from '@playwright/test';
import type { Filter } from 'nostr-tools/filter';
import { neventEncode, npubEncode } from 'nostr-tools/nip19';
import { ChannelCreation, ChannelMetadata, Metadata } from 'nostr-tools/kinds';
import {
	addPresetColumn,
	columnOptionsButton,
	deckColumns,
	openDeck,
	selectDropdownOption,
	sidebarButton
} from './helpers/deck-page';

const pubkey = 'a'.repeat(64);
const channelId = 'b'.repeat(64);
const unavailableChannelId = 'c'.repeat(64);

test('updates shared titles from metadata and stops watching channels that leave the deck', async ({
	page
}) => {
	await page.addInitScript(() => {
		window.__NOSTTER_DECK_SKIP_NOSTR_VERIFY__ = true;
	});
	let latestProfileAvailable = false;
	const profiles: Array<{ socket: WebSocketRoute; id: string }> = [];
	const channels: Array<{ socket: WebSocketRoute; id: string; closed: boolean }> = [];
	await page.routeWebSocket(/.*/, (socket) => {
		socket.onMessage((message) => {
			const [type, id, ...filters] = JSON.parse(String(message)) as [string, string, ...Filter[]];
			if (type === 'CLOSE') {
				for (const channel of channels) {
					if (channel.socket === socket && channel.id === id) {
						channel.closed = true;
					}
				}
				return;
			}
			if (type !== 'REQ') {
				return;
			}
			if (
				filters.some(
					(filter) => filter.kinds?.includes(Metadata) && filter.authors?.includes(pubkey)
				)
			) {
				if (latestProfileAvailable) {
					sendEvent(socket, id, Metadata, 'e'.repeat(64), 'Alicia', 2);
					socket.send(JSON.stringify(['EOSE', id]));
				} else {
					profiles.push({ socket, id });
				}
				return;
			}
			if (
				filters.some(
					(filter) => filter.kinds?.includes(ChannelMetadata) && filter['#e']?.includes(channelId)
				)
			) {
				channels.push({ socket, id, closed: false });
			}
			socket.send(JSON.stringify(['EOSE', id]));
		});
	});

	await openDeck(page);
	const columns = deckColumns(page);
	await addPresetColumn(page, 'timeline_follow', { followTarget: npubEncode(pubkey) });
	const follow = columns.first();
	const profileFallback = `Follow: ${npubEncode(pubkey).slice(0, 12)}`;
	await expect(follow.getByRole('heading')).toHaveText(profileFallback);
	await expect(sidebarButton(page, profileFallback)).toBeVisible();
	await expect.poll(() => profiles.length).toBeGreaterThan(0);
	function sendEvent(
		socket: WebSocketRoute,
		subscription: string,
		kind: number,
		id: string,
		name: string,
		timestamp: number
	) {
		socket.send(
			JSON.stringify([
				'EVENT',
				subscription,
				{
					kind,
					id,
					pubkey,
					content: JSON.stringify({ name }),
					created_at: timestamp,
					tags: kind === ChannelMetadata ? [['e', channelId, '', 'root']] : [],
					sig: '0'.repeat(128)
				}
			])
		);
	}
	for (const { socket, id } of profiles) {
		sendEvent(socket, id, Metadata, 'd'.repeat(64), 'Alice', 1);
	}
	await expect(follow.getByRole('heading')).toHaveText('Follow: Alice');
	latestProfileAvailable = true;
	for (const { socket, id } of profiles) {
		sendEvent(socket, id, Metadata, 'e'.repeat(64), 'Alicia', 2);
		socket.send(JSON.stringify(['EOSE', id]));
	}
	await expect(follow.getByRole('heading')).toHaveText('Follow: Alicia');
	await expect(sidebarButton(page, 'Follow: Alicia')).toBeVisible();

	await addPresetColumn(page, 'timeline_channel', { channelTarget: channelId });
	const channel = columns.nth(1);
	await expect(channel.getByRole('heading')).toHaveText(
		`Channel: ${neventEncode({ id: channelId }).slice(0, 17)}`
	);
	await expect.poll(() => channels.length).toBeGreaterThan(0);
	for (const { socket, id } of channels) {
		sendEvent(socket, id, ChannelCreation, channelId, 'Original', 1);
	}
	await expect(channel.getByRole('heading')).toHaveText('Channel: Original');
	await addPresetColumn(page, 'timeline_channel', { channelTarget: channelId });
	const duplicate = columns.nth(2);
	await expect(duplicate.getByRole('heading')).toHaveText('Channel: Original');
	for (const { socket, id } of channels) {
		sendEvent(socket, id, ChannelMetadata, 'f'.repeat(64), 'Renamed', 2);
	}
	await expect(channel.getByRole('heading')).toHaveText('Channel: Renamed');
	await expect(duplicate.getByRole('heading')).toHaveText('Channel: Renamed');
	await expect(sidebarButton(page, 'Channel: Renamed')).toHaveCount(2);
	expect(new Set(channels.map(({ socket }) => socket.url())).size).toBe(channels.length);

	await columnOptionsButton(duplicate).click();
	await duplicate.getByRole('button', { name: 'Delete column' }).click();
	await columnOptionsButton(channel).click();
	await channel.getByLabel('Channel ID').fill(unavailableChannelId);
	await channel.getByRole('button', { name: 'Save' }).click();
	await expect(channel.getByRole('heading')).toHaveText(
		`Channel: ${neventEncode({ id: unavailableChannelId }).slice(0, 17)}`
	);
	await expect.poll(() => channels.every(({ closed }) => closed)).toBe(true);

	await page.getByRole('button', { name: 'Settings' }).click();
	await selectDropdownOption(page, page.getByLabel('Language'), 'JA');
	await expect(channel.getByRole('heading')).toHaveText(
		`チャンネル: ${neventEncode({ id: unavailableChannelId }).slice(0, 17)}`
	);
	await expect(sidebarButton(page, 'フォロー: Alicia')).toBeVisible();
});
