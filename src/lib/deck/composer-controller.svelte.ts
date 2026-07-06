import { tick } from 'svelte';
import { ShortTextNote } from 'nostr-tools/kinds';
import type { EventSigner } from 'rx-nostr';
import { getPostQuoteTarget, getPostReplyTarget } from './post-actions';
import type { ChannelTimelineColumnConfig, Post } from './types';
import {
	getBlossomImageValidationError,
	maxBlossomImageCount,
	uploadBlossomImage,
	type BlossomUploadResult
} from '$lib/nostr/blossom';
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
	uploadMedia?: typeof uploadBlossomImage;
};

export type ComposerMediaAttachment = {
	id: string;
	file: File;
	name: string;
	size: number;
	type: string;
	previewUrl: string | null;
	status: 'selected' | 'uploading' | 'uploaded' | 'failed';
	errorReason?: 'unsupported-file' | 'file-too-large' | 'signing-failed' | 'upload-failed';
	errorMessage?: string;
	url?: string;
};

export function createComposerController({
	getAccountPubkey,
	getSigner,
	getIncludeClientTag,
	focusTextarea,
	getTargetReadRelays = getNip65ReadRelaysForPubkey,
	uploadMedia = uploadBlossomImage
}: ComposerControllerOptions) {
	let isOpen = $state(false);
	let content = $state('');
	let mode = $state<'post' | 'reply' | 'quote'>('post');
	let replyTargetPost = $state<Post | null>(null);
	let quoteTargetPost = $state<Post | null>(null);
	let isPublishing = $state(false);
	let hasError = $state(false);
	let mediaAttachments = $state<ComposerMediaAttachment[]>([]);
	let mediaNotice = $state<string | null>(null);
	let nextMediaId = 0;
	const isUploadingMedia = $derived(mediaAttachments.some(({ status }) => status === 'uploading'));
	const hasMediaError = $derived(mediaAttachments.some(({ status }) => status === 'failed'));
	const hasContent = $derived(
		content.length > 0 || mediaAttachments.some(({ status }) => status !== 'failed')
	);
	const canSubmit = $derived(
		!isPublishing &&
			!isUploadingMedia &&
			!hasMediaError &&
			((hasContent && (mode === 'post' || (mode === 'reply' && canReply(replyTargetPost)))) ||
				(hasContent && mode === 'quote' && canQuote(quoteTargetPost)))
	);

	async function open() {
		if (!getAccountPubkey()) return;
		if (mode !== 'post') {
			content = '';
			clearMediaAttachments();
		}
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
		if (mode !== 'reply' || currentTargetId !== nextTargetId) {
			content = '';
			clearMediaAttachments();
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
		if (!canQuote(post)) return;
		const currentTargetId = quoteTargetPost ? getPostQuoteTarget(quoteTargetPost)?.id : null;
		const nextTargetId = getPostQuoteTarget(post)?.id ?? null;
		if (mode !== 'quote' || currentTargetId !== nextTargetId) {
			content = '';
			clearMediaAttachments();
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
		clearMediaAttachments();
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
				const mediaUploadResult = await uploadSelectedMedia(signer);
				if (!mediaUploadResult.ok) return mediaUploadResult;
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
		clearMediaAttachments();
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

	function addMediaFiles(files: ArrayLike<File>) {
		if (isPublishing) return;

		mediaNotice = null;
		const selectedFiles = Array.from(files);
		const acceptedLimit = Math.max(0, maxBlossomImageCount - mediaAttachments.length);
		const acceptedFiles = selectedFiles.slice(0, acceptedLimit);
		const ignoredCount = selectedFiles.length - acceptedFiles.length;
		if (ignoredCount > 0) mediaNotice = `media-count-exceeded:${ignoredCount}`;

		const nextAttachments = acceptedFiles.map((file) => createMediaAttachment(file));
		mediaAttachments = [...mediaAttachments, ...nextAttachments];
	}

	function removeMediaAttachment(id: string) {
		if (isPublishing) return;

		const attachment = mediaAttachments.find((media) => media.id === id);
		if (attachment?.previewUrl && typeof URL.revokeObjectURL === 'function') {
			URL.revokeObjectURL(attachment.previewUrl);
		}
		mediaAttachments = mediaAttachments.filter((media) => media.id !== id);
	}

	function clearMediaAttachments() {
		for (const attachment of mediaAttachments) {
			if (attachment.previewUrl && typeof URL.revokeObjectURL === 'function') {
				URL.revokeObjectURL(attachment.previewUrl);
			}
		}
		mediaAttachments = [];
		mediaNotice = null;
	}

	function createMediaAttachment(file: File): ComposerMediaAttachment {
		const validationError = getBlossomImageValidationError(file);
		return {
			id: `media-${nextMediaId++}`,
			file,
			name: file.name,
			size: file.size,
			type: file.type,
			previewUrl: createMediaPreviewUrl(file),
			status: validationError ? 'failed' : 'selected',
			errorReason: validationError ?? undefined
		};
	}

	function createMediaPreviewUrl(file: File) {
		if (typeof URL.createObjectURL !== 'function' || !file.type.startsWith('image/')) return null;
		return URL.createObjectURL(file);
	}

	async function uploadSelectedMedia(
		signer: EventSigner
	): Promise<{ ok: true; urls: string[] } | { ok: false; reason: 'relay-failed' }> {
		const urls: string[] = [];

		for (const attachment of mediaAttachments) {
			if (attachment.status === 'uploaded' && attachment.url) {
				urls.push(attachment.url);
				continue;
			}

			if (attachment.status === 'failed') return { ok: false, reason: 'relay-failed' };

			updateMediaAttachment(attachment.id, { status: 'uploading' });
			const result = await uploadMedia(attachment.file, signer);
			if (!result.ok) {
				updateMediaAttachment(attachment.id, uploadFailurePatch(result));
				return { ok: false, reason: 'relay-failed' };
			}

			updateMediaAttachment(attachment.id, {
				status: 'uploaded',
				url: result.descriptor.url,
				errorReason: undefined,
				errorMessage: undefined
			});
			urls.push(result.descriptor.url);
		}

		return { ok: true, urls };
	}

	function updateMediaAttachment(
		id: string,
		patch: Partial<Pick<ComposerMediaAttachment, 'status' | 'url' | 'errorReason' | 'errorMessage'>>
	) {
		mediaAttachments = mediaAttachments.map((attachment) =>
			attachment.id === id ? { ...attachment, ...patch } : attachment
		);
	}

	function uploadFailurePatch(result: Exclude<BlossomUploadResult, { ok: true }>) {
		return {
			status: 'failed' as const,
			errorReason: result.reason,
			errorMessage: result.message
		};
	}

	function appendMediaUrls(value: string, urls: string[]) {
		if (urls.length === 0) return value;
		const separator = value.length > 0 && !value.endsWith('\n') ? '\n' : '';
		return `${value}${separator}${urls.join('\n')}`;
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
			return isUploadingMedia;
		},
		get hasError() {
			return hasError;
		},
		get mediaAttachments() {
			return mediaAttachments;
		},
		get mediaNotice() {
			return mediaNotice;
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
