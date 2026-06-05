<script lang="ts">
	import { ArrowLeft, ArrowRight, ExternalLink, X } from '@lucide/svelte';
	import { SvelteSet } from 'svelte/reactivity';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import { m } from '$lib/paraglide/messages.js';

	type Props = {
		images: string[];
		open: boolean;
		currentIndex: number;
	};

	let { images, open = $bindable(), currentIndex = $bindable() }: Props = $props();
	let touchStartX: number | undefined;
	const failedImages = new SvelteSet<string>();
	const currentImage = $derived(images[currentIndex]);
	const hasPreviousImage = $derived(currentIndex > 0);
	const hasNextImage = $derived(currentIndex < images.length - 1);

	function showPreviousImage() {
		if (hasPreviousImage) currentIndex -= 1;
	}

	function showNextImage() {
		if (hasNextImage) currentIndex += 1;
	}

	function handleKeydown(event: KeyboardEvent) {
		if (!open) return;

		if (event.key === 'ArrowLeft') {
			event.preventDefault();
			showPreviousImage();
		} else if (event.key === 'ArrowRight') {
			event.preventDefault();
			showNextImage();
		}
	}

	function handleTouchStart(event: TouchEvent) {
		touchStartX = event.changedTouches[0]?.clientX;
	}

	function handleTouchEnd(event: TouchEvent) {
		const touchEndX = event.changedTouches[0]?.clientX;
		if (touchStartX === undefined || touchEndX === undefined) return;

		const distance = touchEndX - touchStartX;
		touchStartX = undefined;
		if (Math.abs(distance) < 50) return;

		if (distance > 0) showPreviousImage();
		else showNextImage();
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<Dialog.Root bind:open>
	<Dialog.Content
		showCloseButton={false}
		class="h-[calc(100dvh-1rem)] max-h-[calc(100dvh-1rem)] max-w-[calc(100%-1rem)] grid-rows-[auto_minmax(0,1fr)_auto] gap-3 overflow-hidden rounded-md bg-black/95 p-3 text-white ring-white/20 sm:h-[calc(100dvh-2rem)] sm:max-h-[calc(100dvh-2rem)] sm:max-w-[calc(100%-2rem)] sm:p-4"
	>
		<Dialog.Title class="sr-only">{m.image_viewer()}</Dialog.Title>

		<div class="flex min-w-0 items-center justify-between gap-3">
			<span class="truncate text-sm text-slate-300">
				{m.image_position({ current: currentIndex + 1, total: images.length })}
			</span>
			<div class="flex shrink-0 items-center gap-1">
				{#if currentImage}
					<a
						href={currentImage}
						target="_blank"
						rel="external noopener noreferrer"
						class="flex size-9 items-center justify-center rounded-md text-slate-200 transition hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
						title={m.open_original_image()}
						aria-label={m.open_original_image()}
					>
						<ExternalLink class="size-5" aria-hidden="true" />
					</a>
				{/if}
				<Dialog.Close
					class="flex size-9 items-center justify-center rounded-md text-slate-200 transition hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
					title={m.close()}
					aria-label={m.close()}
				>
					<X class="size-5" aria-hidden="true" />
				</Dialog.Close>
			</div>
		</div>

		<div
			class="relative flex min-h-0 items-center justify-center overflow-hidden"
			role="group"
			aria-label={m.image_viewer()}
			ontouchstart={handleTouchStart}
			ontouchend={handleTouchEnd}
		>
			{#if currentImage && !failedImages.has(currentImage)}
				<img
					src={currentImage}
					alt=""
					class="max-h-full max-w-full object-contain"
					onerror={() => failedImages.add(currentImage)}
				/>
			{:else if currentImage}
				<div class="flex max-w-xl flex-col items-center gap-3 text-center">
					<p class="text-sm font-semibold">{m.image_load_failed()}</p>
					<p class="max-w-full text-sm [overflow-wrap:anywhere] text-slate-400">{currentImage}</p>
				</div>
			{/if}

			<button
				type="button"
				class="absolute left-1 flex size-10 items-center justify-center rounded-md bg-black/60 text-white transition hover:bg-black/80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:hidden sm:left-3"
				disabled={!hasPreviousImage}
				title={m.previous_image()}
				aria-label={m.previous_image()}
				onclick={showPreviousImage}
			>
				<ArrowLeft class="size-6" aria-hidden="true" />
			</button>
			<button
				type="button"
				class="absolute right-1 flex size-10 items-center justify-center rounded-md bg-black/60 text-white transition hover:bg-black/80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:hidden sm:right-3"
				disabled={!hasNextImage}
				title={m.next_image()}
				aria-label={m.next_image()}
				onclick={showNextImage}
			>
				<ArrowRight class="size-6" aria-hidden="true" />
			</button>
		</div>

		<p class="truncate text-center text-xs text-slate-400">{currentImage}</p>
	</Dialog.Content>
</Dialog.Root>
