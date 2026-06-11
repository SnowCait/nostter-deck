<script lang="ts">
	import { ExternalLink, UserRound, X } from '@lucide/svelte';
	import { npubEncode } from 'nostr-tools/nip19';
	import { m } from '$lib/paraglide/messages.js';
	import type { FontSizeTextClasses } from '$lib/font-size';
	import type { AvatarShape } from '$lib/user-settings';
	import type * as Nostr from 'nostr-typedef';
	import ProfileAvatar from './ProfileAvatar.svelte';

	type Props = {
		id: string;
		pubkey: string;
		textClass: FontSizeTextClasses;
		avatarShape: AvatarShape;
		getProfile: (pubkey: string) => Nostr.Content.Metadata | undefined;
		onClose: () => void;
	};

	const { id, pubkey, textClass, avatarShape, getProfile, onClose }: Props = $props();
	const profile = $derived(getProfile(pubkey));
	const displayName = $derived(
		profile?.display_name ?? profile?.name ?? npubEncode(pubkey).slice(0, 16)
	);
	const npub = $derived(npubEncode(pubkey));
	const websiteUrl = $derived(normalizeWebsiteUrl(profile?.website));

	function normalizeWebsiteUrl(value: string | undefined) {
		if (!value) return null;

		try {
			const url = new URL(value);
			return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null;
		} catch {
			return null;
		}
	}
</script>

<section
	{id}
	tabindex="-1"
	class="flex h-full w-[342px] flex-col overflow-hidden border-r border-slate-200 bg-white outline-none dark:border-slate-800 dark:bg-slate-950"
	data-testid="profile-column"
>
	<header
		class="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 px-3 py-2.5 dark:border-slate-800"
	>
		<div class="flex min-w-0 items-center gap-2">
			<UserRound class="size-4 shrink-0 text-slate-500 dark:text-slate-400" aria-hidden="true" />
			<h2 class={['truncate font-bold', textClass.title]}>{m.profile()}</h2>
		</div>
		<button
			type="button"
			class="flex size-8 items-center justify-center rounded-md text-slate-500 transition hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
			title={m.close()}
			aria-label={m.close()}
			onclick={onClose}
		>
			<X class="size-4" aria-hidden="true" />
		</button>
	</header>

	<div class="min-h-0 flex-1 overflow-y-auto">
		{#if profile?.banner}
			<img class="h-28 w-full object-cover" src={profile.banner} alt="" />
		{/if}
		<div class="p-4">
			<ProfileAvatar
				shape={avatarShape}
				sizeClass="size-20"
				imageUrl={profile?.picture}
				fallbackText={displayName.slice(0, 1)}
				fallbackClass="bg-sky-500 text-2xl font-bold text-white"
				testId="profile-column-avatar"
			/>

			<h3 class={['mt-3 font-bold break-words', textClass.heading]}>{displayName}</h3>
			<p
				class={['mt-1 break-all text-slate-500 dark:text-slate-400', textClass.meta]}
				data-testid="profile-npub"
			>
				{npub}
			</p>

			{#if profile?.about}
				<section class="mt-5">
					<h4 class={['font-semibold text-slate-500 dark:text-slate-400', textClass.meta]}>
						{m.profile_about()}
					</h4>
					<p
						class={[
							'mt-1 break-words whitespace-pre-wrap text-slate-800 dark:text-slate-200',
							textClass.body
						]}
					>
						{profile.about}
					</p>
				</section>
			{/if}

			{#if profile?.nip05}
				<section class="mt-5">
					<h4 class={['font-semibold text-slate-500 dark:text-slate-400', textClass.meta]}>
						{m.profile_nip05()}
					</h4>
					<p class={['mt-1 break-all text-slate-800 dark:text-slate-200', textClass.body]}>
						{profile.nip05}
					</p>
				</section>
			{/if}

			{#if websiteUrl}
				<section class="mt-5">
					<h4 class={['font-semibold text-slate-500 dark:text-slate-400', textClass.meta]}>
						{m.profile_website()}
					</h4>
					<!-- eslint-disable svelte/no-navigation-without-resolve -->
					<a
						class={[
							'mt-1 flex min-w-0 items-center gap-1 text-sky-600 hover:underline dark:text-sky-400',
							textClass.body
						]}
						href={websiteUrl}
						target="_blank"
						rel="noreferrer"
					>
						<span class="truncate">{profile?.website}</span>
						<ExternalLink class="size-3.5 shrink-0" aria-hidden="true" />
					</a>
					<!-- eslint-enable svelte/no-navigation-without-resolve -->
				</section>
			{/if}

			{#if !profile}
				<p class={['mt-5 text-slate-500 dark:text-slate-400', textClass.control]}>
					{m.profile_metadata_unavailable()}
				</p>
			{/if}
		</div>
	</div>
</section>
