import { ChannelCreation, ChannelMetadata } from 'nostr-tools/kinds';
import { createRxForwardReq } from 'rx-nostr';
import { SvelteMap } from 'svelte/reactivity';
import { getNostrClient } from '$lib/nostr/client';
import { getProfile, requestProfiles } from '$lib/nostr/profiles';
import { combineRelays, profileRelays, type RelaySelection } from '$lib/nostr/relays';
import {
	applyChannelTitleEvent,
	getColumnTitle,
	getChannelTitleName,
	type ChannelTitleMetadata
} from './column-title';
import type { ColumnConfig } from './types';
import type { Locale } from '$lib/paraglide/runtime.js';

type Options = {
	getColumns: () => ColumnConfig[];
	getLocale: () => Locale;
	resolveRelaySelection: (selection: RelaySelection) => string[];
};

export function createColumnTitleController({
	getColumns,
	getLocale,
	resolveRelaySelection
}: Options) {
	const channelNames = new SvelteMap<string, string>();
	// eslint-disable-next-line svelte/prefer-svelte-reactivity -- Channel names drive rendering, while subscriptions are tracked separately.
	const channels = new Map<
		string,
		{ getMetadata: () => ChannelTitleMetadata; relayKey: string; stop: () => void }
	>();

	$effect(() => {
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- Rebuilt from the current columns each run.
		const pubkeys = new Set<string>();
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- Rebuilt from the current columns each run.
		const channelRelays = new Map<string, string[]>();
		for (const column of getColumns()) {
			if (column.type !== 'timeline' || column.timelineKind !== 'preset') {
				continue;
			}
			if (column.sourceKey === 'timeline_follow' || column.sourceKey === 'nav_notifications') {
				pubkeys.add(column.pubkey);
			}
			if (column.sourceKey === 'timeline_channel') {
				channelRelays.set(
					column.channelId,
					combineRelays(
						channelRelays.get(column.channelId) ?? [],
						resolveRelaySelection(column.relays)
					)
				);
			}
		}
		requestProfiles([...pubkeys], [...profileRelays]);

		for (const [id, channel] of channels) {
			if (!channelRelays.has(id)) {
				channel.stop();
				channels.delete(id);
				channelNames.delete(id);
			}
		}

		for (const [id, relays] of channelRelays) {
			const relayKey = JSON.stringify([...relays].sort());
			const previous = channels.get(id);
			if (previous?.relayKey === relayKey) {
				continue;
			}
			previous?.stop();

			const request = createRxForwardReq();
			const subscription = getNostrClient().use(request, { on: { relays } });
			// eslint-disable-next-line svelte/prefer-svelte-reactivity -- Only the resolved name is reactive.
			let metadata: ChannelTitleMetadata = previous?.getMetadata() ?? { updates: new Map() };
			const stream = subscription.subscribe(({ event }) => {
				const next = applyChannelTitleEvent(id, metadata, event);
				if (next === metadata) {
					return;
				}
				metadata = next;
				const name = getChannelTitleName(metadata);
				if (name) {
					channelNames.set(id, name);
				}
			});
			channels.set(id, {
				getMetadata: () => metadata,
				relayKey,
				stop: () => stream.unsubscribe()
			});
			request.emit([
				{ kinds: [ChannelCreation], ids: [id] },
				{ kinds: [ChannelMetadata], '#e': [id] }
			]);
		}
	});

	$effect(() => () => {
		for (const channel of channels.values()) {
			channel.stop();
		}
	});

	return {
		getTitle: (column: ColumnConfig) =>
			getColumnTitle(column, getLocale(), getProfile, (id) => channelNames.get(id))
	};
}
