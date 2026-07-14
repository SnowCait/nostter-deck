import { tick } from 'svelte';
import { ChannelMessage, ShortTextNote } from 'nostr-tools/kinds';
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
	publishShortTextNote,
	type PublishPostResult,
	type PublishStage
} from '$lib/nostr/publish';
import { createPublishDiagnostic, type PublishOperation } from '$lib/nostr/publish-diagnostics';
import type { AccountMethod } from '$lib/nostr/accounts';
import { resolveRelaySelection as resolveSelectionRelays } from '$lib/nostr/relays';

type ComposerControllerOptions = {
	getAccountPubkey: () => string | null;
	getSigner: () => EventSigner | null;
	getIncludeClientTag: () => boolean;
	focusTextarea: () => void;
	getTargetReadRelays?: (pubkey: string) => Promise<string[]>;
	resolveRelaySelection?: (selection: RelaySelection) => string[];
	uploadMedia?: typeof uploadBlossomImage;
	getAccountDiagnosticContext?: () => {
		method: AccountMethod;
		nip46RelayUrls: string[];
		nip46AuthChallengeObservedAt: number | null;
	};
};

export function createComposerController({
	getAccountPubkey,
	getSigner,
	getIncludeClientTag,
	focusTextarea,
	getTargetReadRelays = getNip65ReadRelaysForPubkey,
	resolveRelaySelection = resolveSelectionRelays,
	uploadMedia = uploadBlossomImage,
	getAccountDiagnosticContext = () => ({
		method: 'nip07',
		nip46RelayUrls: [],
		nip46AuthChallengeObservedAt: null
	})
}: ComposerControllerOptions) {
	let isOpen = $state(false);
	let content = $state('');
	let mode = $state<'post' | 'reply' | 'quote'>('post');
	let replyTargetPost = $state<Post | null>(null);
	let quoteTargetPost = $state<Post | null>(null);
	let isPublishing = $state(false);
	let hasError = $state(false);
	let publishFailure = $state<Extract<PublishPostResult, { ok: false }> | null>(null);
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
		publishFailure = null;
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
		publishFailure = null;
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
		publishFailure = null;
		await tick();
		focusTextarea();
	}

	function close() {
		isOpen = false;
		hasError = false;
		publishFailure = null;
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
		publishFailure = null;
		const startedAt = Date.now();
		const replyTarget = replyTargetPost ? getPostReplyTarget(replyTargetPost) : null;
		const quoteTarget = quoteTargetPost ? getPostQuoteTarget(quoteTargetPost) : null;
		let currentStage: PublishStage = 'uploading-media';
		const result = await (async (): Promise<PublishPostResult> => {
			try {
				const mediaUploadResult = await media.uploadSelectedMedia(signer);
				if (!mediaUploadResult.ok) {
					return mediaUploadResult;
				}
				const publishContent = appendMediaUrls(content, mediaUploadResult.urls);
				currentStage = 'publishing';

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
			} catch (internalError) {
				return {
					ok: false,
					reason: currentStage === 'uploading-media' ? 'media-upload-failed' : 'relay-failed',
					stage: currentStage,
					targetRelayCount: 0,
					internalError
				};
			} finally {
				isPublishing = false;
			}
		})();
		if (!result.ok) {
			publishFailure = withDiagnostic(result, operationForMode(mode), ShortTextNote, startedAt);
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
		const startedAt = Date.now();
		if (!pubkey || !signer) {
			return withDiagnostic(
				{
					ok: false,
					reason: 'signing-failed',
					stage: 'signing',
					targetRelayCount: 0
				},
				'channel-message',
				ChannelMessage,
				startedAt
			);
		}
		let currentStage: PublishStage = 'uploading-media';
		try {
			const mediaUploadResult = await channelMedia?.uploadSelectedMedia(signer);
			if (mediaUploadResult && !mediaUploadResult.ok) {
				return withDiagnostic(mediaUploadResult, 'channel-message', ChannelMessage, startedAt);
			}
			const publishContent = appendMediaUrls(content, mediaUploadResult?.urls ?? []);
			currentStage = 'publishing';
			const result = await publishChannelMessage(
				publishContent,
				channel.channelId,
				pubkey,
				signer,
				resolveRelaySelection(channel.relays),
				{
					includeClientTag: getIncludeClientTag()
				}
			);
			return result.ok
				? result
				: withDiagnostic(result, 'channel-message', ChannelMessage, startedAt);
		} catch (internalError) {
			return withDiagnostic(
				{
					ok: false,
					reason: currentStage === 'uploading-media' ? 'media-upload-failed' : 'relay-failed',
					stage: currentStage,
					targetRelayCount: 0,
					internalError
				},
				'channel-message',
				ChannelMessage,
				startedAt
			);
		}
	}

	function withDiagnostic(
		failure: Extract<PublishPostResult, { ok: false }>,
		operationType: PublishOperation,
		eventKind: number,
		startedAt: number
	): Extract<PublishPostResult, { ok: false }> {
		const context = getAccountDiagnosticContext();
		const diagnostic = createPublishDiagnostic({
			operationType,
			eventKind,
			accountMethod: context.method,
			failingStage: failure.stage,
			failureReason: failure.reason,
			elapsedMs: Date.now() - startedAt,
			targetRelayCount: failure.targetRelayCount,
			nip46RelayUrls: context.method === 'nip46' ? context.nip46RelayUrls : [],
			authChallengeObserved:
				context.method === 'nip46'
					? context.nip46AuthChallengeObservedAt !== null &&
						context.nip46AuthChallengeObservedAt >= startedAt
					: null
		});
		console.error(`[publish:${diagnostic.diagnosticId}]`, {
			diagnostic,
			internalErrorName:
				failure.internalError instanceof Error
					? failure.internalError.name
					: typeof failure.internalError
		});
		return { ...failure, diagnostic };
	}

	function operationForMode(value: typeof mode): PublishOperation {
		return value === 'reply' ? 'reply' : value === 'quote' ? 'quote' : 'post';
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
		get publishFailure() {
			return publishFailure;
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
