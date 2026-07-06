import { tick } from 'svelte';
import { ShortTextNote } from 'nostr-tools/kinds';
import type { EventSigner } from 'rx-nostr';
import { getPostQuoteTarget, getPostReplyTarget } from './post-actions';
import type { ChannelTimelineColumnConfig, Post } from './types';
import { getNip65ReadRelaysForPubkey } from '$lib/nostr/nip65';
import {
	publishChannelMessage,
	publishQuoteRepost,
	publishReply,
	publishShortTextNote
} from '$lib/nostr/publish';

type ComposerControllerOptions = {
	getAccountPubkey: () => string | null;
	getSigner: () => EventSigner | null;
	getIncludeClientTag: () => boolean;
	focusTextarea: () => void;
	getTargetReadRelays?: (pubkey: string) => Promise<string[]>;
};

export function createComposerController({
	getAccountPubkey,
	getSigner,
	getIncludeClientTag,
	focusTextarea,
	getTargetReadRelays = getNip65ReadRelaysForPubkey
}: ComposerControllerOptions) {
	let isOpen = $state(false);
	let content = $state('');
	let mode = $state<'post' | 'reply' | 'quote'>('post');
	let replyTargetPost = $state<Post | null>(null);
	let quoteTargetPost = $state<Post | null>(null);
	let isPublishing = $state(false);
	let hasError = $state(false);
	const canSubmit = $derived(
		!isPublishing &&
			((content.length > 0 &&
				(mode === 'post' || (mode === 'reply' && canReply(replyTargetPost)))) ||
				(content.trim().length > 0 && mode === 'quote' && canQuote(quoteTargetPost)))
	);

	async function open() {
		if (!getAccountPubkey()) return;
		if (mode !== 'post') content = '';
		mode = 'post';
		replyTargetPost = null;
		quoteTargetPost = null;
		isOpen = true;
		await tick();
		focusTextarea();
	}

	async function openReply(post: Post) {
		if (!canReply(post)) return;
		const currentTargetId = replyTargetPost ? getPostReplyTarget(replyTargetPost)?.id : null;
		const nextTargetId = getPostReplyTarget(post)?.id ?? null;
		if (mode !== 'reply' || currentTargetId !== nextTargetId) content = '';
		mode = 'reply';
		replyTargetPost = post;
		quoteTargetPost = null;
		isOpen = true;
		hasError = false;
		await tick();
		focusTextarea();
	}

	async function openQuote(post: Post) {
		if (!canQuote(post)) return;
		const currentTargetId = quoteTargetPost ? getPostQuoteTarget(quoteTargetPost)?.id : null;
		const nextTargetId = getPostQuoteTarget(post)?.id ?? null;
		if (mode !== 'quote' || currentTargetId !== nextTargetId) content = '';
		mode = 'quote';
		replyTargetPost = null;
		quoteTargetPost = post;
		isOpen = true;
		hasError = false;
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
		mode = 'post';
		replyTargetPost = null;
		quoteTargetPost = null;
	}

	function canReply(post: Post | null) {
		const target = post ? getPostReplyTarget(post) : null;
		return Boolean(target?.kind === ShortTextNote && getAccountPubkey() && getSigner());
	}

	function canQuote(post: Post | null) {
		const target = post ? getPostQuoteTarget(post) : null;
		return Boolean(target?.kind === ShortTextNote && getAccountPubkey() && getSigner());
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
		const replyTarget = replyTargetPost ? getPostReplyTarget(replyTargetPost) : null;
		const quoteTarget = quoteTargetPost ? getPostQuoteTarget(quoteTargetPost) : null;
		const result = await (async () => {
			try {
				if (mode === 'reply' && replyTarget) {
					return await publishReply(
						content,
						replyTarget,
						pubkey,
						signer,
						await getTargetReadRelays(replyTarget.pubkey),
						{
							includeClientTag: getIncludeClientTag()
						}
					);
				}

				if (mode === 'quote' && quoteTarget) {
					return await publishQuoteRepost(
						content,
						quoteTarget,
						pubkey,
						signer,
						await getTargetReadRelays(quoteTarget.pubkey),
						{
							includeClientTag: getIncludeClientTag()
						}
					);
				}

				return await publishShortTextNote(content, pubkey, signer, {
					includeClientTag: getIncludeClientTag()
				});
			} catch {
				return { ok: false as const, reason: 'relay-failed' as const };
			} finally {
				isPublishing = false;
			}
		})();
		if (!result.ok) {
			hasError = true;
			return;
		}

		content = '';
		isOpen = false;
		mode = 'post';
		replyTargetPost = null;
		quoteTargetPost = null;
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
		get isReplyMode() {
			return mode === 'reply';
		},
		get isQuoteMode() {
			return mode === 'quote';
		},
		get replyTargetPost() {
			return replyTargetPost;
		},
		get quoteTargetPost() {
			return quoteTargetPost;
		},
		canReply,
		canQuote,
		close,
		handleKeydown,
		open,
		openQuote,
		openReply,
		publish,
		publishChannel,
		reset
	};
}
