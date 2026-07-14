import type { EventSigner } from 'rx-nostr';
import {
	getBlossomImageValidationError,
	maxBlossomImageCount,
	uploadBlossomImage,
	type BlossomUploadResult
} from '$lib/nostr/blossom';

type MediaAttachmentControllerOptions = {
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

export function createMediaAttachmentController({
	uploadMedia = uploadBlossomImage
}: MediaAttachmentControllerOptions = {}) {
	let mediaAttachments = $state<ComposerMediaAttachment[]>([]);
	let mediaNotice = $state<string | null>(null);
	let nextMediaId = 0;
	const isUploadingMedia = $derived(mediaAttachments.some(({ status }) => status === 'uploading'));
	const hasMediaError = $derived(mediaAttachments.some(({ status }) => status === 'failed'));
	const hasPublishableMedia = $derived(mediaAttachments.some(({ status }) => status !== 'failed'));

	function addMediaFiles(files: ArrayLike<File>) {
		mediaNotice = null;
		const selectedFiles = Array.from(files);
		const acceptedLimit = Math.max(0, maxBlossomImageCount - mediaAttachments.length);
		const acceptedFiles = selectedFiles.slice(0, acceptedLimit);
		const ignoredCount = selectedFiles.length - acceptedFiles.length;
		if (ignoredCount > 0) {
			mediaNotice = `media-count-exceeded:${ignoredCount}`;
		}

		const nextAttachments = acceptedFiles.map((file) => createMediaAttachment(file));
		mediaAttachments = [...mediaAttachments, ...nextAttachments];
	}

	function removeMediaAttachment(id: string) {
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
		if (typeof URL.createObjectURL !== 'function' || !file.type.startsWith('image/')) {
			return null;
		}
		return URL.createObjectURL(file);
	}

	async function uploadSelectedMedia(signer: EventSigner): Promise<
		| { ok: true; urls: string[] }
		| {
				ok: false;
				reason: 'media-upload-failed';
				stage: 'uploading-media';
				targetRelayCount: 0;
				internalError?: unknown;
		  }
	> {
		const urls: string[] = [];

		for (const attachment of mediaAttachments) {
			if (attachment.status === 'uploaded' && attachment.url) {
				urls.push(attachment.url);
				continue;
			}

			if (attachment.status === 'failed') {
				return {
					ok: false,
					reason: 'media-upload-failed',
					stage: 'uploading-media',
					targetRelayCount: 0
				};
			}

			updateMediaAttachment(attachment.id, { status: 'uploading' });
			const result = await uploadMedia(attachment.file, signer);
			if (!result.ok) {
				updateMediaAttachment(attachment.id, uploadFailurePatch(result));
				return {
					ok: false,
					reason: 'media-upload-failed',
					stage: 'uploading-media',
					targetRelayCount: 0,
					internalError: new Error(result.message)
				};
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

	return {
		get mediaAttachments() {
			return mediaAttachments;
		},
		get mediaNotice() {
			return mediaNotice;
		},
		get isUploadingMedia() {
			return isUploadingMedia;
		},
		get hasMediaError() {
			return hasMediaError;
		},
		get hasPublishableMedia() {
			return hasPublishableMedia;
		},
		addMediaFiles,
		clearMediaAttachments,
		removeMediaAttachment,
		uploadSelectedMedia
	};
}

export type MediaAttachmentController = ReturnType<typeof createMediaAttachmentController>;

export function appendMediaUrls(value: string, urls: string[]) {
	if (urls.length === 0) {
		return value;
	}
	const separator = value.length > 0 && !value.endsWith('\n') ? '\n' : '';
	return `${value}${separator}${urls.join('\n')}`;
}
