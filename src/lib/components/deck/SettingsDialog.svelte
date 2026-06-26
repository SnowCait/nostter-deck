<script lang="ts">
	import {
		ChevronDown,
		CircleUserRound,
		Languages,
		Settings,
		SlidersHorizontal,
		SunMoon,
		VolumeX
	} from '@lucide/svelte';
	import { npubEncode } from 'nostr-tools/nip19';
	import type { Profile } from '$lib/nostr/profiles';
	import * as Dialog from '$lib/components/ui/dialog';
	import * as Select from '$lib/components/ui/select';
	import type { FontSizeTextClasses } from '$lib/font-size';
	import { m } from '$lib/paraglide/messages.js';
	import { getLocale, locales, setLocale } from '$lib/paraglide/runtime.js';
	import {
		applyThemePreference,
		avatarShapePreferences,
		fontSizePreferences,
		readUserSettings,
		postActionVisibilityPreferences,
		themePreferences,
		updateUserSettings,
		type AvatarShape,
		type FontSize,
		type PostActionVisibility,
		type ThemePreference
	} from '$lib/user-settings';
	import ProfileAvatar from './ProfileAvatar.svelte';
	import CustomEmojiText from './CustomEmojiText.svelte';

	type AppLocale = (typeof locales)[number];
	type Props = {
		isOpen: boolean;
		fontSize: FontSize;
		avatarShape: AvatarShape;
		postActionVisibility: PostActionVisibility;
		textClass: FontSizeTextClasses;
		onFontSizeChange: (fontSize: FontSize) => void;
		onAvatarShapeChange: (avatarShape: AvatarShape) => void;
		onPostActionVisibilityChange: (visibility: PostActionVisibility) => void;
		mutedPubkeys: string[];
		getProfile: (pubkey: string) => Profile | undefined;
		requestProfiles: (pubkeys: string[], relays: string[]) => void;
		profileRelays: string[];
		onUnmuteUser: (pubkey: string) => void;
	};

	let {
		isOpen = $bindable(),
		fontSize,
		avatarShape,
		postActionVisibility,
		textClass,
		onFontSizeChange,
		onAvatarShapeChange,
		onPostActionVisibilityChange,
		mutedPubkeys,
		getProfile,
		requestProfiles,
		profileRelays,
		onUnmuteUser
	}: Props = $props();
	let currentLocale = $state<AppLocale>(getLocale());
	let themePreference = $state(readUserSettings().theme);
	let includeClientTag = $state(readUserSettings().includeClientTag);
	let isMutedUsersExpanded = $state(false);

	const localeLabels: Record<AppLocale, string> = {
		en: 'EN',
		ja: 'JA'
	};
	const themeLabels = {
		system: () => m.theme_system(),
		light: () => m.theme_light(),
		dark: () => m.theme_dark()
	} satisfies Record<ThemePreference, () => string>;
	const fontSizeLabels = {
		large: () => m.font_size_large(),
		medium: () => m.font_size_medium(),
		small: () => m.font_size_small()
	} satisfies Record<FontSize, () => string>;
	const avatarShapeLabels = {
		circle: () => m.avatar_shape_circle(),
		square: () => m.avatar_shape_square()
	} satisfies Record<AvatarShape, () => string>;
	const postActionVisibilityLabels = {
		onInteraction: () => m.post_action_visibility_on_interaction(),
		always: () => m.post_action_visibility_always()
	} satisfies Record<PostActionVisibility, () => string>;
	const localeOptions = $derived(locales.map((value) => ({ value, label: localeLabels[value] })));
	const themeOptions = $derived(
		themePreferences.map((value) => ({ value, label: themeLabels[value]() }))
	);
	const fontSizeOptions = $derived(
		fontSizePreferences.map((value) => ({ value, label: fontSizeLabels[value]() }))
	);
	const avatarShapeOptions = $derived(
		avatarShapePreferences.map((value) => ({ value, label: avatarShapeLabels[value]() }))
	);
	const postActionVisibilityOptions = $derived(
		postActionVisibilityPreferences.map((value) => ({
			value,
			label: postActionVisibilityLabels[value]()
		}))
	);
	const selectedLocaleLabel = $derived(
		localeOptions.find(({ value }) => value === currentLocale)?.label ?? ''
	);
	const selectedThemeLabel = $derived(
		themeOptions.find(({ value }) => value === themePreference)?.label ?? ''
	);
	const selectedFontSizeLabel = $derived(
		fontSizeOptions.find(({ value }) => value === fontSize)?.label ?? ''
	);
	const selectedAvatarShapeLabel = $derived(
		avatarShapeOptions.find(({ value }) => value === avatarShape)?.label ?? ''
	);
	const selectedPostActionVisibilityLabel = $derived(
		postActionVisibilityOptions.find(({ value }) => value === postActionVisibility)?.label ?? ''
	);

	$effect(() => {
		if (!isOpen || !isMutedUsersExpanded || mutedPubkeys.length === 0) return;
		requestProfiles(mutedPubkeys, profileRelays);
	});

	$effect(() => {
		if (!isOpen) isMutedUsersExpanded = false;
	});

	function selectLocale(value: string) {
		const selectedLocale = value as AppLocale;
		currentLocale = selectedLocale;
		setLocale(selectedLocale);
	}

	function selectTheme(value: string) {
		const selectedTheme = value as ThemePreference;
		themePreference = selectedTheme;
		updateUserSettings((currentSettings) => ({
			...currentSettings,
			theme: selectedTheme
		}));
		applyThemePreference(selectedTheme);
	}

	function selectFontSize(value: string) {
		const selectedFontSize = value as FontSize;
		updateUserSettings((currentSettings) => ({
			...currentSettings,
			fontSize: selectedFontSize
		}));
		onFontSizeChange(selectedFontSize);
	}

	function selectAvatarShape(value: string) {
		const selectedAvatarShape = value as AvatarShape;
		updateUserSettings((currentSettings) => ({
			...currentSettings,
			avatarShape: selectedAvatarShape
		}));
		onAvatarShapeChange(selectedAvatarShape);
	}

	function selectPostActionVisibility(value: string) {
		const selectedVisibility = value as PostActionVisibility;
		updateUserSettings((currentSettings) => ({
			...currentSettings,
			postActionVisibility: selectedVisibility
		}));
		onPostActionVisibilityChange(selectedVisibility);
	}

	function toggleIncludeClientTag(event: Event) {
		includeClientTag = (event.currentTarget as HTMLInputElement).checked;
		updateUserSettings((currentSettings) => ({
			...currentSettings,
			includeClientTag
		}));
	}

	function getMutedUserName(pubkey: string) {
		const profile = getProfile(pubkey);
		return profile?.display_name ?? profile?.name ?? npubEncode(pubkey).slice(0, 16);
	}
</script>

<Dialog.Root bind:open={isOpen}>
	<Dialog.Content
		class="max-h-[calc(100dvh-2rem)] max-w-sm gap-0 overflow-x-hidden overflow-y-auto overscroll-contain rounded-md border border-slate-200 bg-white p-4 text-slate-950 shadow-xl ring-0 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-50"
		closeLabel={m.close()}
	>
		<div class="mb-4 flex items-center justify-between gap-3 pr-10">
			<div class="flex min-w-0 items-center gap-2">
				<Settings class="size-4 shrink-0 text-slate-500 dark:text-slate-400" aria-hidden="true" />
				<Dialog.Title class={['min-w-0 truncate font-bold', textClass.title]}>
					{m.nav_settings()}
				</Dialog.Title>
			</div>
		</div>

		<section aria-labelledby="settings-general-title">
			<h3
				id="settings-general-title"
				class={[
					'mb-3 font-bold tracking-wide text-slate-500 uppercase dark:text-slate-400',
					textClass.section
				]}
			>
				{m.settings_general()}
			</h3>
			<label
				id="locale-label"
				class={[
					'mb-2 flex items-center gap-2 font-semibold text-slate-700 dark:text-slate-300',
					textClass.label
				]}
				for="locale"
			>
				<Languages class="size-4 shrink-0 text-slate-500 dark:text-slate-400" aria-hidden="true" />
				<span>{m.language_switcher()}</span>
			</label>
			<Select.Root
				type="single"
				items={localeOptions}
				value={currentLocale}
				onValueChange={selectLocale}
			>
				<Select.Trigger
					id="locale"
					aria-labelledby="locale-label"
					class={[
						'h-10 w-full border-slate-300 bg-white px-3 text-slate-950 shadow-none focus-visible:border-sky-500 focus-visible:ring-2 focus-visible:ring-sky-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50 dark:hover:bg-slate-900 dark:focus-visible:border-sky-400 dark:focus-visible:ring-sky-950',
						textClass.control
					]}
				>
					<span class="truncate">{selectedLocaleLabel}</span>
				</Select.Trigger>
				<Select.Content class="z-[60]">
					{#each localeOptions as option (option.value)}
						<Select.Item value={option.value} label={option.label} />
					{/each}
				</Select.Content>
			</Select.Root>

			<label
				class={[
					'mt-4 flex items-center gap-2 font-semibold text-slate-700 dark:text-slate-300',
					textClass.label
				]}
			>
				<input
					type="checkbox"
					class="size-4 shrink-0 accent-sky-500"
					checked={includeClientTag}
					onchange={toggleIncludeClientTag}
				/>
				<span>{m.attach_client_information()}</span>
			</label>
		</section>

		<section class="mt-5" aria-labelledby="settings-appearance-title">
			<h3
				id="settings-appearance-title"
				class={[
					'mb-3 font-bold tracking-wide text-slate-500 uppercase dark:text-slate-400',
					textClass.section
				]}
			>
				{m.settings_appearance()}
			</h3>
			<label
				id="theme-label"
				class={[
					'mb-2 flex items-center gap-2 font-semibold text-slate-700 dark:text-slate-300',
					textClass.label
				]}
				for="theme"
			>
				<SunMoon class="size-4 shrink-0 text-slate-500 dark:text-slate-400" aria-hidden="true" />
				<span>{m.theme_switcher()}</span>
			</label>
			<Select.Root
				type="single"
				items={themeOptions}
				value={themePreference}
				onValueChange={selectTheme}
			>
				<Select.Trigger
					id="theme"
					aria-labelledby="theme-label"
					class={[
						'h-10 w-full border-slate-300 bg-white px-3 text-slate-950 shadow-none focus-visible:border-sky-500 focus-visible:ring-2 focus-visible:ring-sky-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50 dark:hover:bg-slate-900 dark:focus-visible:border-sky-400 dark:focus-visible:ring-sky-950',
						textClass.control
					]}
				>
					<span class="truncate">{selectedThemeLabel}</span>
				</Select.Trigger>
				<Select.Content class="z-[60]">
					{#each themeOptions as option (option.value)}
						<Select.Item value={option.value} label={option.label} />
					{/each}
				</Select.Content>
			</Select.Root>

			<label
				id="font-size-label"
				class={[
					'mt-4 mb-2 flex items-center gap-2 font-semibold text-slate-700 dark:text-slate-300',
					textClass.label
				]}
				for="font-size"
			>
				<SlidersHorizontal
					class="size-4 shrink-0 text-slate-500 dark:text-slate-400"
					aria-hidden="true"
				/>
				<span>{m.font_size_switcher()}</span>
			</label>
			<Select.Root
				type="single"
				items={fontSizeOptions}
				value={fontSize}
				onValueChange={selectFontSize}
			>
				<Select.Trigger
					id="font-size"
					aria-labelledby="font-size-label"
					class={[
						'h-10 w-full border-slate-300 bg-white px-3 text-slate-950 shadow-none focus-visible:border-sky-500 focus-visible:ring-2 focus-visible:ring-sky-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50 dark:hover:bg-slate-900 dark:focus-visible:border-sky-400 dark:focus-visible:ring-sky-950',
						textClass.control
					]}
				>
					<span class="truncate">{selectedFontSizeLabel}</span>
				</Select.Trigger>
				<Select.Content class="z-[60]">
					{#each fontSizeOptions as option (option.value)}
						<Select.Item value={option.value} label={option.label} />
					{/each}
				</Select.Content>
			</Select.Root>

			<label
				id="avatar-shape-label"
				class={[
					'mt-4 mb-2 flex items-center gap-2 font-semibold text-slate-700 dark:text-slate-300',
					textClass.label
				]}
				for="avatar-shape"
			>
				<CircleUserRound
					class="size-4 shrink-0 text-slate-500 dark:text-slate-400"
					aria-hidden="true"
				/>
				<span>{m.avatar_shape_switcher()}</span>
			</label>
			<Select.Root
				type="single"
				items={avatarShapeOptions}
				value={avatarShape}
				onValueChange={selectAvatarShape}
			>
				<Select.Trigger
					id="avatar-shape"
					aria-labelledby="avatar-shape-label"
					class={[
						'h-10 w-full border-slate-300 bg-white px-3 text-slate-950 shadow-none focus-visible:border-sky-500 focus-visible:ring-2 focus-visible:ring-sky-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50 dark:hover:bg-slate-900 dark:focus-visible:border-sky-400 dark:focus-visible:ring-sky-950',
						textClass.control
					]}
				>
					<span class="truncate">{selectedAvatarShapeLabel}</span>
				</Select.Trigger>
				<Select.Content class="z-[60]">
					{#each avatarShapeOptions as option (option.value)}
						<Select.Item value={option.value} label={option.label} />
					{/each}
				</Select.Content>
			</Select.Root>

			<label
				id="post-action-visibility-label"
				class={[
					'mt-4 mb-2 flex items-center gap-2 font-semibold text-slate-700 dark:text-slate-300',
					textClass.label
				]}
				for="post-action-visibility"
			>
				<SlidersHorizontal
					class="size-4 shrink-0 text-slate-500 dark:text-slate-400"
					aria-hidden="true"
				/>
				<span>{m.post_action_visibility_switcher()}</span>
			</label>
			<Select.Root
				type="single"
				items={postActionVisibilityOptions}
				value={postActionVisibility}
				onValueChange={selectPostActionVisibility}
			>
				<Select.Trigger
					id="post-action-visibility"
					aria-labelledby="post-action-visibility-label"
					class={[
						'h-10 w-full border-slate-300 bg-white px-3 text-slate-950 shadow-none focus-visible:border-sky-500 focus-visible:ring-2 focus-visible:ring-sky-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50 dark:hover:bg-slate-900 dark:focus-visible:border-sky-400 dark:focus-visible:ring-sky-950',
						textClass.control
					]}
				>
					<span class="truncate">{selectedPostActionVisibilityLabel}</span>
				</Select.Trigger>
				<Select.Content class="z-[60]">
					{#each postActionVisibilityOptions as option (option.value)}
						<Select.Item value={option.value} label={option.label} />
					{/each}
				</Select.Content>
			</Select.Root>
		</section>

		<section class="mt-5 min-w-0" aria-labelledby="settings-muted-users-toggle">
			<button
				type="button"
				id="settings-muted-users-toggle"
				class={[
					'flex w-full min-w-0 items-center gap-2 rounded-md py-2 text-left font-bold tracking-wide text-slate-500 uppercase transition hover:bg-slate-100 hover:text-slate-700 focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:outline-none dark:text-slate-400 dark:hover:bg-slate-900 dark:hover:text-slate-200',
					textClass.section
				]}
				aria-expanded={isMutedUsersExpanded}
				aria-controls="settings-muted-users-content"
				onclick={() => (isMutedUsersExpanded = !isMutedUsersExpanded)}
			>
				<VolumeX class="size-4 shrink-0" aria-hidden="true" />
				<span class="min-w-0 flex-1 truncate">
					{m.settings_muted_users_count({ count: mutedPubkeys.length })}
				</span>
				<ChevronDown
					class={['size-4 shrink-0 transition-transform', isMutedUsersExpanded ? 'rotate-180' : '']}
					aria-hidden="true"
				/>
			</button>
			{#if isMutedUsersExpanded}
				<div
					id="settings-muted-users-content"
					class="mt-3 min-w-0"
					data-testid="muted-users-content"
				>
					{#if mutedPubkeys.length === 0}
						<p class={['text-slate-500 dark:text-slate-400', textClass.body]}>
							{m.muted_users_empty()}
						</p>
					{:else}
						<div class="flex w-full min-w-0 flex-col gap-2">
							{#each mutedPubkeys as pubkey (pubkey)}
								{@const profile = getProfile(pubkey)}
								{@const name = getMutedUserName(pubkey)}
								<div
									class="flex w-full min-w-0 items-center gap-3 rounded-md border border-slate-200 p-2 dark:border-slate-800"
								>
									<ProfileAvatar
										shape={avatarShape}
										sizeClass="size-9"
										imageUrl={profile?.picture}
										fallbackText={name.slice(0, 1)}
										fallbackClass="bg-slate-500 text-sm font-bold text-white"
									/>
									<div class="min-w-0 flex-1">
										<p class={['truncate font-semibold', textClass.account]}>
											<CustomEmojiText text={name} customEmojis={profile?.customEmojis ?? []} />
										</p>
										<p class={['truncate text-slate-500 dark:text-slate-400', textClass.meta]}>
											{npubEncode(pubkey)}
										</p>
									</div>
									<button
										type="button"
										class={[
											'shrink-0 rounded-md px-2 py-1 font-semibold text-sky-600 transition hover:bg-sky-50 focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:outline-none dark:text-sky-300 dark:hover:bg-sky-950/40',
											textClass.meta
										]}
										aria-label={m.unmute_user({ name })}
										title={m.unmute_user({ name })}
										onclick={() => onUnmuteUser(pubkey)}
									>
										{m.unmute()}
									</button>
								</div>
							{/each}
						</div>
					{/if}
				</div>
			{/if}
		</section>
	</Dialog.Content>
</Dialog.Root>
