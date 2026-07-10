import { tick } from 'svelte';
import { ShortTextNote } from 'nostr-tools/kinds';
import type { EventSigner } from 'rx-nostr';
import { getPostQuoteTarget, getPostReplyTarget } from './post-actions';
import type { ChannelTimelineColumnConfig, Post, RelaySelection } from './types';
import {
	appendMediaUrls,
	createMediaAttachmentController,
	type MediaAttachmentController
} from './media-attachment-controller.svelte';
import { uploadBlossomImage } from '$lib/nostr/blossom';
import { getNip65ReadRelaysForPubkey } from '$lib/nostr/nip65';
import {
	publishChannelMessage,
	publishQuoteRepost,
	publishReply,
	publishShortTextNote
} from '$lib/nostr/publish';
import { resolveRelaySelection as resolveSelectionRelays } from '$lib/nostr/relays';

type ComposerControllerOptions = {
	getAccountPubkey: () => string | null;
	getSigner: () => EventSigner | null;
	getIncludeClientTag: () => boolean;
	focusTextarea: () => void;
	getTargetReadRelays?: (pubkey: string) => Promise<string[]>;
	resolveRelaySelection?: (selection: RelaySelection) => string[];
	uploadMedia?: typeof uploadBlossomImage;
};

export function createComposerController({
	getAccountPubkey,
	getSigner,
	getIncludeClientTag,
	focusTextarea,
	getTargetReadRelays = getNip65ReadRelaysForPubkey,
	resolveRelaySelection = resolveSelectionRelays,
	uploadMedia = uploadBlossomImage
}: ComposerControllerOptions) {
	let isOpen = $state(false);
	let content = $state('');
	let mode = $state<'post' | 'reply' | 'quote'>('post');
	let replyTargetPost = $state<Post | null>(null);
	let quoteTargetPost = $state<Post | null>(null);
	let isPublishing = $state(false);
	let hasError = $state(false);
	const media = createMediaAttachmentController({ uploadMedia });
	const hasContent = $derived(content.length > 0 || media.hasPublishableMedia);
	const canSubmit = $derived(
		!isPublishing &&
			!media.isUploadingMedia &&
			!media.hasMediaError &&
			((hasContent && (mode === 'post' || (mode === 'reply' && canReply(replyTargetPost)))) ||
				(hasContent && mode === 'quote' && canQuote(quoteTargetPost)))
	);

	async function open() {
		if (!getAccountPubkey()) {
			return;
		}
		if (mode !== 'post') {
			content = '';
			media.clearMediaAttachments();
		}
		mode = 'post';
		replyTargetPost = null;
		quoteTargetPost = null;
		isOpen = true;
		await tick();
		focusTextarea();
	}

	async function openReply(post: Post) {
		if (!canReply(post)) {
			return;
		}
		const currentTargetId = replyTargetPost ? getPostReplyTarget(replyTargetPost)?.id : null;
		const nextTargetId = getPostReplyTarget(post)?.id ?? null;
		if (mode !== 'reply' || currentTargetId !== nextTargetId) {
			content = '';
			media.clearMediaAttachments();
		}
		mode = 'reply';
		replyTargetPost = post;
		quoteTargetPost = null;
		isOpen = true;
		hasError = false;
		await tick();
		focusTextarea();
	}

	async function openQuote(post: Post) {
		if (!canQuote(post)) {
			return;
		}
		const currentTargetId = quoteTargetPost ? getPostQuoteTarget(quoteTargetPost)?.id : null;
		const nextTargetId = getPostQuoteTarget(post)?.id ?? null;
		if (mode !== 'quote' || currentTargetId !== nextTargetId) {
			content = '';
			media.clearMediaAttachments();
		}
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
		media.clearMediaAttachments();
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
				const mediaUploadResult = await media.uploadSelectedMedia(signer);
				if (!mediaUploadResult.ok) {
					return mediaUploadResult;
				}
				const publishContent = appendMediaUrls(content, mediaUploadResult.urls);

				if (mode === 'reply' && replyTarget) {
					return await publishReply(
						publishContent,
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
						publishContent,
						quoteTarget,
						pubkey,
						signer,
						await getTargetReadRelays(quoteTarget.pubkey),
						{
							includeClientTag: getIncludeClientTag()
						}
					);
				}

				return await publishShortTextNote(publishContent, pubkey, signer, {
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
		media.clearMediaAttachments();
	}

	async function publishChannel(
		channel: ChannelTimelineColumnConfig,
		content: string,
		channelMedia?: MediaAttachmentController
	) {
		const pubkey = getAccountPubkey();
		const signer = getSigner();
		if (!pubkey || !signer) {
			return { ok: false as const, reason: 'signing-failed' as const };
		}
		const mediaUploadResult = await channelMedia?.uploadSelectedMedia(signer);
		if (mediaUploadResult && !mediaUploadResult.ok) {
			return mediaUploadResult;
		}
		const publishContent = appendMediaUrls(content, mediaUploadResult?.urls ?? []);
		return publishChannelMessage(
			publishContent,
			channel.channelId,
			pubkey,
			signer,
			resolveRelaySelection(channel.relays),
			{
				includeClientTag: getIncludeClientTag()
			}
		);
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key !== 'Enter' || (!event.ctrlKey && !event.metaKey)) {
			return;
		}
		event.preventDefault();
		void publish();
	}

	function addMediaFiles(files: ArrayLike<File>) {
		if (isPublishing) {
			return;
		}
		media.addMediaFiles(files);
	}

	function removeMediaAttachment(id: string) {
		if (isPublishing) {
			return;
		}
		media.removeMediaAttachment(id);
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
		get isUploadingMedia() {
			return media.isUploadingMedia;
		},
		get hasError() {
			return hasError;
		},
		get mediaAttachments() {
			return media.mediaAttachments;
		},
		get mediaNotice() {
			return media.mediaNotice;
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
		addMediaFiles,
		canReply,
		canQuote,
		close,
		handleKeydown,
		open,
		openQuote,
		openReply,
		publish,
		publishChannel,
		removeMediaAttachment,
		reset
	};
}
