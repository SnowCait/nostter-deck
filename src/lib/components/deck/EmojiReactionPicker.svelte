<script lang="ts">
	import { onMount } from 'svelte';
	import * as Popover from '$lib/components/ui/popover';
	import { m } from '$lib/paraglide/messages.js';
	import jaI18n from 'emoji-picker-element/i18n/ja';
	import enI18n from 'emoji-picker-element/i18n/en';
	import jaDataSource from 'emoji-picker-element-data/ja/cldr/data.json?url';
	import enDataSource from 'emoji-picker-element-data/en/cldr/data.json?url';
	import { SmilePlus } from '@lucide/svelte';
	import type Picker from 'emoji-picker-element/picker';
	import type { CustomEmoji, EmojiClickEventDetail, I18n } from 'emoji-picker-element/shared';
	import type { CustomEmojiReactionCandidate, EmojiReaction } from '$lib/nostr/emoji-reactions';
	import type { Locale } from '$lib/paraglide/runtime.js';

	type Props = {
		customEmojis: CustomEmojiReactionCandidate[];
		locale: Locale;
		disabled?: boolean;
		isPublishing?: boolean;
		buttonClass: string | string[];
		onSelect: (reaction: EmojiReaction) => void;
	};

	const {
		customEmojis,
		locale,
		disabled = false,
		isPublishing = false,
		buttonClass,
		onSelect
	}: Props = $props();

	let isOpen = $state(false);
	let isPickerReady = $state(false);
	let pickerElement = $state<Picker>();
	const pickerElementTag = 'emoji-picker';
	const fallbackCategoryLabel = 'Nostr';
	const userEmojiCategoryPrefix = '10030:';
	const categoryEntries = $derived.by(() => {
		const entries: { id: string; label: string; order: number }[] = [];
		for (const candidate of customEmojis) {
			const categoryId = candidate.categoryId ?? fallbackCategoryLabel;
			if (entries.some((entry) => entry.id === categoryId)) continue;

			entries.push({
				id: categoryId,
				label: getCategoryLabel(candidate),
				order: candidate.categoryOrder ?? Number.MAX_SAFE_INTEGER
			});
		}
		return entries;
	});
	const pickerCategories = $derived(
		categoryEntries.map((entry) => ({
			...entry,
			pickerLabel:
				categoryEntries.filter((candidate) => candidate.label === entry.label).length > 1
					? `${entry.label} (${getCategorySuffix(entry.id)})`
					: entry.label
		}))
	);
	const pickerCustomEmoji = $derived(
		customEmojis.map(
			(candidate): CustomEmoji => ({
				name: candidate.pickerName,
				shortcodes: candidate.shortcodes,
				url: candidate.url,
				category: getPickerCategory(candidate.categoryId ?? fallbackCategoryLabel)
			})
		)
	);

	const i18nByLocale = {
		en: enI18n,
		ja: jaI18n
	} satisfies Record<Locale, I18n>;
	const dataSourceByLocale = {
		en: enDataSource,
		ja: jaDataSource
	} satisfies Record<Locale, string>;

	onMount(() => {
		void import('emoji-picker-element/picker').then(() => {
			isPickerReady = true;
		});
	});

	$effect(() => {
		if (!pickerElement) return;

		pickerElement.locale = locale;
		pickerElement.i18n = i18nByLocale[locale];
		pickerElement.dataSource = dataSourceByLocale[locale];
		pickerElement.customEmoji = pickerCustomEmoji;
		pickerElement.customCategorySorting = sortCustomCategories;
	});

	function getCategoryLabel(candidate: CustomEmojiReactionCandidate) {
		if (
			candidate.categoryId?.startsWith(userEmojiCategoryPrefix) &&
			candidate.categoryLabel === 'My emojis'
		) {
			return m.emoji_category_my_emojis();
		}
		return candidate.categoryLabel ?? fallbackCategoryLabel;
	}

	function getCategorySuffix(categoryId: string) {
		const parts = categoryId.split(':');
		return parts.at(-1)?.slice(0, 8) ?? categoryId.slice(0, 8);
	}

	function getPickerCategory(categoryId: string) {
		return (
			pickerCategories.find((category) => category.id === categoryId)?.pickerLabel ??
			fallbackCategoryLabel
		);
	}

	function sortCustomCategories(categoryA: string, categoryB: string) {
		const orderA =
			pickerCategories.find((category) => category.pickerLabel === categoryA)?.order ??
			Number.MAX_SAFE_INTEGER;
		const orderB =
			pickerCategories.find((category) => category.pickerLabel === categoryB)?.order ??
			Number.MAX_SAFE_INTEGER;
		return orderA - orderB || categoryA.localeCompare(categoryB);
	}

	function handleEmojiClick(event: Event) {
		const { unicode, emoji } = (event as CustomEvent<EmojiClickEventDetail>).detail;
		if (unicode) {
			onSelect({ type: 'unicode', emoji: unicode });
			isOpen = false;
			return;
		}

		const candidate = customEmojis.find((customEmoji) => customEmoji.pickerName === emoji.name);
		if (!candidate) return;

		onSelect({
			type: 'custom',
			shortcode: candidate.primaryShortcode,
			url: candidate.url,
			...(candidate.address ? { address: candidate.address } : {})
		});
		isOpen = false;
	}
</script>

<Popover.Root bind:open={isOpen}>
	<Popover.Trigger
		type="button"
		{disabled}
		class={buttonClass}
		title={m.react_with_emoji()}
		aria-label={m.react_with_emoji()}
		aria-busy={isPublishing}
	>
		<SmilePlus class="size-4" aria-hidden="true" />
	</Popover.Trigger>
	<Popover.Content
		align="start"
		sideOffset={4}
		class="w-[360px] max-w-[calc(100vw-1rem)] overflow-hidden p-0"
	>
		<div class="emoji-picker-host">
			{#if isPickerReady}
				<svelte:element
					this={pickerElementTag}
					bind:this={pickerElement}
					onemoji-click={handleEmojiClick}
				/>
			{/if}
		</div>
	</Popover.Content>
</Popover.Root>

<style>
	.emoji-picker-host :global(emoji-picker) {
		width: 100%;
		height: 360px;
		--num-columns: 8;
		--category-emoji-size: 1.25rem;
		--category-emoji-padding: 0.4375rem;
		--border-radius: 0;
		--border-color: transparent;
		--outline-color: hsl(204 94% 94%);
	}

	@media screen and (max-width: 360px) {
		.emoji-picker-host :global(emoji-picker) {
			--num-columns: 6;
			--category-emoji-size: 1.125rem;
			--category-emoji-padding: 0.375rem;
		}
	}
</style>
