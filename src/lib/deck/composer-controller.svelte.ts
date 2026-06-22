import { tick } from 'svelte';
import type { ChannelTimelineColumnConfig } from './types';
import type { Nip07Signer } from '$lib/nostr/auth.svelte';
import { publishChannelMessage, publishShortTextNote } from '$lib/nostr/publish';

type ComposerControllerOptions = {
	getAccountPubkey: () => string | null;
	getSigner: () => Nip07Signer | null;
	getIncludeClientTag: () => boolean;
	focusTextarea: () => void;
};

export function createComposerController({
	getAccountPubkey,
	getSigner,
	getIncludeClientTag,
	focusTextarea
}: ComposerControllerOptions) {
	let isOpen = $state(false);
	let content = $state('');
	let isPublishing = $state(false);
	let hasError = $state(false);
	const canSubmit = $derived(!isPublishing && content.length > 0);

	async function open() {
		if (!getAccountPubkey()) return;
		isOpen = true;
		await tick();
		focusTextarea();
	}

	function close() {
		isOpen = false;
		hasError = false;
	}

	function reset() {
		close();
		content = '';
	}

	async function publish() {
		const pubkey = getAccountPubkey();
		const signer = getSigner();
		if (!canSubmit || !pubkey || !signer) {
			hasError = true;
			return;
		}

		isPublishing = true;
		hasError = false;
		const result = await publishShortTextNote(content, pubkey, signer, {
			includeClientTag: getIncludeClientTag()
		});
		isPublishing = false;
		if (!result.ok) {
			hasError = true;
			return;
		}

		content = '';
		isOpen = false;
	}

	async function publishChannel(channel: ChannelTimelineColumnConfig, content: string) {
		const pubkey = getAccountPubkey();
		const signer = getSigner();
		if (!pubkey || !signer) return { ok: false as const, reason: 'signing-failed' as const };
		return publishChannelMessage(content, channel.channelId, pubkey, signer, channel.relays, {
			includeClientTag: getIncludeClientTag()
		});
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key !== 'Enter' || (!event.ctrlKey && !event.metaKey)) return;
		event.preventDefault();
		void publish();
	}

	return {
		get isOpen() {
			return isOpen;
		},
		get content() {
			return content;
		},
		set content(value: string) {
			content = value;
		},
		get isPublishing() {
			return isPublishing;
		},
		get hasError() {
			return hasError;
		},
		get canSubmit() {
			return canSubmit;
		},
		close,
		handleKeydown,
		open,
		publish,
		publishChannel,
		reset
	};
}
