<script lang="ts">
	import { onDestroy } from 'svelte';
	import { Send } from '@lucide/svelte';
	import { m } from '$lib/paraglide/messages.js';
	import { createPastedImageFileReader } from '$lib/deck/media-attachment-actions';
	import {
		applyComposerEmojiSelection,
		type ComposerCustomEmoji
	} from '$lib/deck/composer-emoji-actions';
	import { createMediaAttachmentController } from '$lib/deck/media-attachment-controller.svelte';
	import type { MentionCandidate } from '$lib/deck/mention-actions';
	import type { ChannelTimelineColumnConfig } from '$lib/deck/types';
	import type { FontSizeTextClasses } from '$lib/font-size';
	import type {
		CustomEmojiDefinition,
		CustomEmojiReactionCandidate,
		EmojiReaction
	} from '$lib/nostr/emoji-reactions';
	import type { PublishPostResult } from '$lib/nostr/publish';
	import type { Locale } from '$lib/paraglide/runtime.js';
	import EmojiReactionPicker from './EmojiReactionPicker.svelte';
	import MediaAttachmentControls from './MediaAttachmentControls.svelte';
	import MentionTextarea from './MentionTextarea.svelte';
	import PublishFailureNotice from './PublishFailureNotice.svelte';

	type Props = {
		channel: ChannelTimelineColumnConfig;
		textClass: FontSizeTextClasses;
		mentionCandidates: MentionCandidate[];
		emojiReactionCandidates: CustomEmojiReactionCandidate[];
		appLocale: Locale;
		onPublish: (
			content: string,
			media: ReturnType<typeof createMediaAttachmentController>,
			customEmojis: CustomEmojiDefinition[]
		) => Promise<PublishPostResult>;
	};

	let {
		channel,
		textClass,
		mentionCandidates,
		emojiReactionCandidates,
		appLocale,
		onPublish
	}: Props = $props();
	let content = $state('');
	let isPublishing = $state(false);
	let publishFailure = $state<Extract<PublishPostResult, { ok: false }> | null>(null);
	let hasFocusWithin = $state(false);
	let isMediaPickerOpen = $state(false);
	let isEmojiPickerOpen = $state(false);
	let selectedCustomEmojis: ComposerCustomEmoji[] = [];
	let textareaEditor = $state<{ insertText: (text: string) => Promise<void> }>();
	const media = createMediaAttachmentController();
	const getPastedImageFiles = createPastedImageFileReader();

	const isExpanded = $derived(
		hasFocusWithin ||
			isMediaPickerOpen ||
			isEmojiPickerOpen ||
			content.length > 0 ||
			media.mediaAttachments.length > 0 ||
			publishFailure
	);
	const canSubmit = $derived(
		!isPublishing &&
			!media.isUploadingMedia &&
			!media.hasMediaError &&
			(content.trim().length > 0 || media.hasPublishableMedia)
	);
	const submitLabel = $derived(
		isPublishing
			? media.isUploadingMedia
				? m.media_uploading()
				: m.post_sending()
			: m.action_post()
	);

	onDestroy(() => {
		media.clearMediaAttachments();
	});

	async function publish() {
		if (!canSubmit) {
			return;
		}

		isPublishing = true;
		publishFailure = null;
		let result: PublishPostResult;
		try {
			result = await onPublish(content, media, selectedCustomEmojis);
		} finally {
			isPublishing = false;
		}

		if (!result.ok) {
			publishFailure = result;
			return;
		}

		content = '';
		selectedCustomEmojis = [];
		media.clearMediaAttachments();
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key !== 'Enter' || (!event.ctrlKey && !event.metaKey)) {
			return;
		}

		event.preventDefault();
		void publish();
	}

	function handlePaste(event: ClipboardEvent) {
		if (isPublishing) {
			return;
		}

		const files = getPastedImageFiles(event);
		if (files.length === 0) {
			return;
		}

		event.preventDefault();
		media.addMediaFiles(files);
	}

	function handleFocusOut(event: FocusEvent) {
		if (isMediaPickerOpen || isEmojiPickerOpen) {
			return;
		}
		const currentTarget = event.currentTarget as HTMLElement;
		const nextTarget = event.relatedTarget;
		if (!(nextTarget instanceof Node) || !currentTarget.contains(nextTarget)) {
			hasFocusWithin = false;
		}
	}

	function handleMediaPickerOpen() {
		hasFocusWithin = true;
		isMediaPickerOpen = true;
	}

	function handleMediaPickerClose() {
		isMediaPickerOpen = false;
	}

	function handleEmojiPickerOpenChange(open: boolean) {
		isEmojiPickerOpen = open;
		if (open) {
			hasFocusWithin = true;
		}
	}

	function selectEmoji(reaction: EmojiReaction) {
		const selection = applyComposerEmojiSelection(selectedCustomEmojis, reaction);
		selectedCustomEmojis = selection.customEmojis;
		void textareaEditor?.insertText(selection.insertion);
	}
</script>

<section
	class="shrink-0 border-b border-slate-200 bg-slate-50 px-3 py-3 dark:border-slate-800 dark:bg-slate-900/70"
	data-testid="channel-composer"
>
	<form
		class="grid gap-2"
		onfocusin={() => (hasFocusWithin = true)}
		onfocusout={handleFocusOut}
		onsubmit={(event) => {
			event.preventDefault();
			void publish();
		}}
	>
		<div class="flex items-start gap-2">
			<label class="sr-only" for={`channel-compose-${channel.id}`}>{m.channel_post_text()}</label>
			<MentionTextarea
				bind:this={textareaEditor}
				id={`channel-compose-${channel.id}`}
				rows={isExpanded ? 3 : 1}
				rootClass="min-w-0 flex-1"
				textareaClass={[
					'min-h-10 w-full resize-y rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-950 transition outline-none placeholder:text-slate-400 focus:border-sky-500 focus:ring-2 focus:ring-sky-100 disabled:cursor-wait dark:border-slate-700 dark:bg-slate-950 dark:text-slate-50 dark:placeholder:text-slate-500 dark:focus:border-sky-400 dark:focus:ring-sky-950',
					textClass.control
				]}
				value={content}
				candidates={mentionCandidates}
				onValueChange={(value) => (content = value)}
				placeholder={m.channel_compose_placeholder()}
				disabled={isPublishing}
				aria-keyshortcuts="Control+Enter Meta+Enter"
				data-channel-compose-input
				onkeydown={handleKeydown}
				onpaste={handlePaste}
			/>
			<button
				type="submit"
				class={[
					'inline-flex size-10 shrink-0 items-center justify-center rounded-md bg-sky-500 font-bold text-white transition hover:bg-sky-600 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500 dark:bg-sky-400 dark:text-slate-950 dark:hover:bg-sky-300 disabled:dark:bg-slate-800 disabled:dark:text-slate-500',
					textClass.control
				]}
				title={submitLabel}
				aria-label={submitLabel}
				disabled={!canSubmit}
			>
				<Send class="size-4" aria-hidden="true" />
			</button>
		</div>
		{#if isExpanded}
			<MediaAttachmentControls
				{media}
				{textClass}
				{isPublishing}
				listTestId="channel-compose-media-list"
				onMediaPickerOpen={handleMediaPickerOpen}
				onMediaPickerClose={handleMediaPickerClose}
			>
				<EmojiReactionPicker
					customEmojis={emojiReactionCandidates}
					locale={appLocale}
					disabled={isPublishing}
					{isPublishing}
					buttonClass="flex size-9 items-center justify-center rounded-md text-slate-500 transition hover:bg-slate-100 hover:text-slate-950 disabled:cursor-not-allowed disabled:text-slate-400 dark:text-slate-400 dark:hover:bg-slate-900 dark:hover:text-slate-50 disabled:dark:text-slate-600"
					label={m.add_emoji()}
					onSelect={selectEmoji}
					onOpenChange={handleEmojiPickerOpenChange}
				/>
			</MediaAttachmentControls>
		{/if}
		{#if publishFailure}
			<PublishFailureNotice failure={publishFailure} {textClass} />
		{/if}
	</form>
</section>
