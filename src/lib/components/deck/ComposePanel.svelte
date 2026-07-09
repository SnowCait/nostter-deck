<script lang="ts">
	import { CalendarClock, MessageCircle, Quote, Send, Smile, UserRound, X } from '@lucide/svelte';
	import type { createComposerController } from '$lib/deck/composer-controller.svelte';
	import { createPastedImageFileReader } from '$lib/deck/media-attachment-actions';
	import type { FontSizeTextClasses } from '$lib/font-size';
	import type { Profile } from '$lib/nostr/profiles';
	import { m } from '$lib/paraglide/messages.js';
	import type { AvatarShape } from '$lib/user-settings';
	import MediaAttachmentControls from './MediaAttachmentControls.svelte';
	import ProfileAvatar from './ProfileAvatar.svelte';

	type Props = {
		composer: ReturnType<typeof createComposerController>;
		accountName: string;
		accountProfile: Profile | undefined;
		avatarShape: AvatarShape;
		textClass: FontSizeTextClasses;
		textarea?: HTMLTextAreaElement;
	};

	let {
		composer,
		accountName,
		accountProfile,
		avatarShape,
		textClass,
		textarea = $bindable()
	}: Props = $props();

	const getPastedImageFiles = createPastedImageFileReader();

	function handlePaste(event: ClipboardEvent) {
		if (composer.isPublishing) {
			return;
		}

		const files = getPastedImageFiles(event);
		if (files.length === 0) {
			return;
		}

		event.preventDefault();
		composer.addMediaFiles(files);
	}
</script>

<section
	class="flex h-full w-[360px] shrink-0 flex-col border-r border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950"
	aria-labelledby="compose-panel-title"
	data-compose-panel
>
	<header
		class="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 px-3 py-2.5 dark:border-slate-800"
	>
		<div class="flex min-w-0 items-center gap-2">
			{#if composer.isReplyMode}
				<MessageCircle class="size-4 shrink-0 text-sky-500" aria-hidden="true" />
			{:else if composer.isQuoteMode}
				<Quote class="size-4 shrink-0 text-sky-500" aria-hidden="true" />
			{:else}
				<Send class="size-4 shrink-0 text-sky-500" aria-hidden="true" />
			{/if}
			<h2 id="compose-panel-title" class={['min-w-0 truncate font-bold', textClass.heading]}>
				{composer.isReplyMode ? m.reply() : composer.isQuoteMode ? m.quote() : m.action_post()}
			</h2>
		</div>
		<button
			type="button"
			class="flex size-8 items-center justify-center rounded-md text-slate-500 transition hover:bg-slate-100 hover:text-slate-950 dark:text-slate-400 dark:hover:bg-slate-900 dark:hover:text-slate-50"
			title={m.close()}
			aria-label={m.close()}
			onclick={composer.close}
		>
			<X class="size-4" aria-hidden="true" />
		</button>
	</header>

	<div
		class="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain p-4"
		data-testid="compose-panel-scroll"
	>
		<div class="mb-3 flex shrink-0 items-center gap-3">
			<ProfileAvatar
				shape={avatarShape}
				sizeClass="size-10"
				imageUrl={accountProfile?.picture}
				fallbackClass="bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-950"
				testId="account-avatar"
			>
				<UserRound class="size-4" aria-hidden="true" />
			</ProfileAvatar>
			<p class={['min-w-0 truncate font-bold', textClass.control]}>{accountName}</p>
		</div>

		{#if composer.isReplyMode && composer.replyTargetPost}
			<div
				class={[
					'mb-3 shrink-0 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-slate-600 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-300',
					textClass.control
				]}
			>
				<p class="truncate font-semibold">
					{m.replying_to_author({ name: composer.replyTargetPost.author })}
				</p>
				<p class={['mt-1 line-clamp-3 whitespace-pre-wrap', textClass.meta]}>
					{composer.replyTargetPost.body}
				</p>
			</div>
		{:else if composer.isQuoteMode && composer.quoteTargetPost}
			<div
				class={[
					'mb-3 shrink-0 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-slate-600 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-300',
					textClass.control
				]}
			>
				<p class="truncate font-semibold">
					{m.quoting_author({ name: composer.quoteTargetPost.author })}
				</p>
				<p class={['mt-1 line-clamp-3 whitespace-pre-wrap', textClass.meta]}>
					{composer.quoteTargetPost.body}
				</p>
			</div>
		{/if}

		<label class="sr-only" for="compose-text">
			{composer.isReplyMode
				? m.reply_text()
				: composer.isQuoteMode
					? m.quote_text()
					: m.post_text()}
		</label>
		<textarea
			id="compose-text"
			class={[
				'min-h-[220px] flex-1 resize-none rounded-md border border-slate-200 bg-white p-3 text-slate-950 transition outline-none placeholder:text-slate-400 focus:border-sky-500 focus:ring-2 focus:ring-sky-100 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-50 dark:placeholder:text-slate-500 dark:focus:border-sky-400 dark:focus:ring-sky-950',
				textClass.textarea
			]}
			placeholder={composer.isReplyMode
				? m.reply_placeholder()
				: composer.isQuoteMode
					? m.quote_placeholder()
					: m.compose_placeholder()}
			disabled={composer.isPublishing}
			aria-keyshortcuts="Control+Enter Meta+Enter"
			bind:this={textarea}
			bind:value={composer.content}
			onkeydown={composer.handleKeydown}
			onpaste={handlePaste}
		></textarea>

		<MediaAttachmentControls
			media={composer}
			{textClass}
			isPublishing={composer.isPublishing}
			listTestId="compose-media-list"
			rootClass="mt-3 grid gap-0"
			noticeClass="mt-2 text-amber-600 dark:text-amber-300"
			listClass="mt-3 flex flex-col gap-2"
			itemClass="flex min-w-0 items-center gap-3 rounded-md border border-slate-200 bg-slate-50 p-2 dark:border-slate-800 dark:bg-slate-900/70"
			thumbnailClass="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-md bg-slate-200 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
			removeButtonClass="flex size-8 shrink-0 items-center justify-center rounded-md text-slate-500 transition hover:bg-slate-200 hover:text-slate-950 disabled:cursor-not-allowed disabled:text-slate-400 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-50 disabled:dark:text-slate-600"
		>
			<button
				type="button"
				class="flex size-9 cursor-not-allowed items-center justify-center rounded-md text-slate-400 dark:text-slate-600"
				title={m.coming_soon()}
				aria-label={m.add_emoji()}
				disabled
			>
				<Smile class="size-4" aria-hidden="true" />
			</button>
			<button
				type="button"
				class="flex size-9 cursor-not-allowed items-center justify-center rounded-md text-slate-400 dark:text-slate-600"
				title={m.coming_soon()}
				aria-label={m.schedule_post()}
				disabled
			>
				<CalendarClock class="size-4" aria-hidden="true" />
			</button>
		</MediaAttachmentControls>

		{#if composer.hasError}
			<p class={['mt-3 text-rose-600 dark:text-rose-400', textClass.control]} role="alert">
				{m.post_failed()}
			</p>
		{/if}

		<div class="mt-4 flex justify-end">
			<button
				type="button"
				class={[
					'h-10 rounded-md bg-sky-500 px-4 font-bold text-white transition hover:bg-sky-600 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500 dark:bg-sky-400 dark:text-slate-950 dark:hover:bg-sky-300 disabled:dark:bg-slate-800 disabled:dark:text-slate-500',
					textClass.control
				]}
				disabled={!composer.canSubmit}
				onclick={composer.publish}
			>
				{#if composer.isPublishing}
					{composer.isUploadingMedia
						? m.media_uploading()
						: composer.isReplyMode
							? m.reply_sending()
							: composer.isQuoteMode
								? m.quote_sending()
								: m.post_sending()}
				{:else}
					{composer.isReplyMode ? m.reply() : composer.isQuoteMode ? m.quote() : m.action_post()}
				{/if}
			</button>
		</div>
	</div>
</section>
