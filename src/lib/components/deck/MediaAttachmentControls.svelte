<script lang="ts">
	import type { Snippet } from 'svelte';
	import { Image, X } from '@lucide/svelte';
	import type { ComposerMediaAttachment } from '$lib/deck/media-attachment-controller.svelte';
	import type { FontSizeTextClasses } from '$lib/font-size';
	import { m } from '$lib/paraglide/messages.js';

	type MediaAttachmentControlState = {
		mediaAttachments: ComposerMediaAttachment[];
		mediaNotice: string | null;
		addMediaFiles: (files: ArrayLike<File>) => void;
		removeMediaAttachment: (id: string) => void;
	};

	type Props = {
		media: MediaAttachmentControlState;
		textClass: FontSizeTextClasses;
		isPublishing: boolean;
		listTestId: string;
		children?: Snippet;
		onMediaPickerOpen?: () => void;
		onMediaPickerClose?: () => void;
		rootClass?: string | string[];
		toolbarClass?: string | string[];
		noticeClass?: string | string[];
		listClass?: string | string[];
		itemClass?: string | string[];
		thumbnailClass?: string | string[];
		removeButtonClass?: string | string[];
	};

	let {
		media,
		textClass,
		isPublishing,
		listTestId,
		children,
		onMediaPickerOpen,
		onMediaPickerClose,
		rootClass = 'grid gap-2',
		toolbarClass = 'flex items-center gap-1',
		noticeClass = 'text-amber-600 dark:text-amber-300',
		listClass = 'flex flex-col gap-2',
		itemClass = 'flex min-w-0 items-center gap-2 rounded-md border border-slate-200 bg-white p-2 dark:border-slate-800 dark:bg-slate-950',
		thumbnailClass = 'flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-md bg-slate-200 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
		removeButtonClass = 'flex size-8 shrink-0 items-center justify-center rounded-md text-slate-500 transition hover:bg-slate-100 hover:text-slate-950 disabled:cursor-not-allowed disabled:text-slate-400 dark:text-slate-400 dark:hover:bg-slate-900 dark:hover:text-slate-50 disabled:dark:text-slate-600'
	}: Props = $props();

	let mediaInput = $state<HTMLInputElement>();
	const mediaNoticeText = $derived(getMediaNoticeText(media.mediaNotice));

	function openMediaPicker() {
		onMediaPickerOpen?.();
		mediaInput?.click();
	}

	function handleMediaChange(event: Event) {
		onMediaPickerClose?.();
		const input = event.currentTarget as HTMLInputElement;
		if (input.files) {
			media.addMediaFiles(input.files);
		}
		input.value = '';
	}

	function formatFileSize(size: number) {
		const mib = size / (1024 * 1024);
		return `${mib.toFixed(mib >= 10 ? 0 : 1)} MiB`;
	}

	function getMediaNoticeText(notice: string | null) {
		if (!notice?.startsWith('media-count-exceeded:')) {
			return null;
		}
		const count = Number(notice.split(':')[1]);
		return Number.isFinite(count) ? m.media_count_exceeded({ count }) : null;
	}

	function getMediaErrorText(
		reason: 'unsupported-file' | 'file-too-large' | 'signing-failed' | 'upload-failed' | undefined,
		message: string | undefined
	) {
		if (reason === 'unsupported-file') {
			return m.media_unsupported_file();
		}
		if (reason === 'file-too-large') {
			return m.media_file_too_large();
		}
		if (reason === 'signing-failed') {
			return m.media_signing_failed();
		}
		return message ?? m.media_upload_failed();
	}
</script>

<svelte:window onfocus={onMediaPickerClose} />

<div class={rootClass}>
	<div class={toolbarClass}>
		<input
			class="sr-only"
			type="file"
			accept="image/*"
			multiple
			bind:this={mediaInput}
			onchange={handleMediaChange}
		/>
		<button
			type="button"
			class="flex size-9 items-center justify-center rounded-md text-slate-500 transition hover:bg-slate-100 hover:text-slate-950 disabled:cursor-not-allowed disabled:text-slate-400 dark:text-slate-400 dark:hover:bg-slate-900 dark:hover:text-slate-50 disabled:dark:text-slate-600"
			title={m.add_media()}
			aria-label={m.add_media()}
			disabled={isPublishing}
			onclick={openMediaPicker}
		>
			<Image class="size-4" aria-hidden="true" />
		</button>
		{@render children?.()}
	</div>

	{#if mediaNoticeText}
		<p class={[noticeClass, textClass.meta]} role="status">
			{mediaNoticeText}
		</p>
	{/if}

	{#if media.mediaAttachments.length > 0}
		<div class={listClass} data-testid={listTestId}>
			{#each media.mediaAttachments as attachment (attachment.id)}
				<div class={itemClass}>
					<div class={thumbnailClass}>
						{#if attachment.previewUrl}
							<img
								class="h-full w-full object-cover"
								src={attachment.previewUrl}
								alt=""
								aria-hidden="true"
								decoding="async"
							/>
						{:else}
							<Image class="size-5" aria-hidden="true" />
						{/if}
					</div>
					<div class="min-w-0 flex-1">
						<p
							class={['truncate font-semibold text-slate-700 dark:text-slate-200', textClass.meta]}
						>
							{attachment.name}
						</p>
						<p class={['truncate text-slate-500 dark:text-slate-400', textClass.meta]}>
							{#if attachment.status === 'uploading'}
								{m.media_uploading()}
							{:else if attachment.status === 'uploaded'}
								{m.media_uploaded()}
							{:else}
								{formatFileSize(attachment.size)}
							{/if}
						</p>
						{#if attachment.status === 'failed'}
							<p class={['mt-1 text-rose-600 dark:text-rose-400', textClass.meta]} role="alert">
								{getMediaErrorText(attachment.errorReason, attachment.errorMessage)}
							</p>
						{/if}
					</div>
					<button
						type="button"
						class={removeButtonClass}
						aria-label={m.remove_media({ name: attachment.name })}
						title={m.remove_media({ name: attachment.name })}
						disabled={isPublishing}
						onclick={() => media.removeMediaAttachment(attachment.id)}
					>
						<X class="size-4" aria-hidden="true" />
					</button>
				</div>
			{/each}
		</div>
	{/if}
</div>
