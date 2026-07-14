<script lang="ts">
	import { tick, untrack } from 'svelte';
	import type { ClassValue, HTMLTextareaAttributes } from 'svelte/elements';
	import {
		applyTextInsertion,
		applyMentionSelection,
		getActiveMentionQuery,
		hydrateCanonicalMentions,
		reconcileMentionRanges,
		searchMentionCandidates,
		serializeMentionText,
		type MentionCandidate,
		type MentionRange
	} from '$lib/deck/mention-actions';
	import { m } from '$lib/paraglide/messages.js';

	type Props = Omit<
		HTMLTextareaAttributes,
		| 'value'
		| 'class'
		| 'oninput'
		| 'onkeydown'
		| 'onpaste'
		| 'onfocus'
		| 'onblur'
		| 'onselect'
		| 'onclick'
		| 'oncompositionstart'
		| 'oncompositionend'
	> & {
		id: string;
		value: string;
		candidates: MentionCandidate[];
		onValueChange: (value: string) => void;
		rootClass?: ClassValue;
		textareaClass?: ClassValue;
		textarea?: HTMLTextAreaElement;
		onkeydown?: (event: KeyboardEvent) => void;
		onpaste?: (event: ClipboardEvent) => void;
	};

	let {
		id,
		value,
		candidates,
		onValueChange,
		rootClass = '',
		textareaClass = '',
		textarea = $bindable(),
		onkeydown,
		onpaste,
		...textareaAttributes
	}: Props = $props();

	const initialValue = untrack(() => hydrateCanonicalMentions(value, candidates));
	let displayText = $state(initialValue.text);
	let mentions = $state<MentionRange[]>(initialValue.mentions);
	let lastCanonicalValue = $state(untrack(() => value));
	let selectionStart = $state(0);
	let selectionEnd = $state(0);
	let isFocused = $state(false);
	let isComposing = $state(false);
	let dismissedQueryKey = $state<string | null>(null);
	let activeIndex = $state(0);
	let candidateSignature = $state('');

	const activeQuery = $derived(
		getActiveMentionQuery(displayText, selectionStart, selectionEnd, mentions)
	);
	const queryKey = $derived(
		activeQuery
			? `${activeQuery.start}:${activeQuery.end}:${activeQuery.query}:${displayText.length}`
			: null
	);
	const matchingCandidates = $derived(
		activeQuery ? searchMentionCandidates(candidates, activeQuery.query) : []
	);
	const isListOpen = $derived(
		isFocused &&
			!isComposing &&
			activeQuery !== null &&
			matchingCandidates.length > 0 &&
			queryKey !== dismissedQueryKey
	);
	const listboxId = $derived(`${id}-mention-listbox`);
	const activeOptionId = $derived(
		isListOpen && matchingCandidates[activeIndex]
			? `${id}-mention-option-${matchingCandidates[activeIndex].pubkey}`
			: undefined
	);

	export async function insertText(insertion: string) {
		const result = applyTextInsertion(
			displayText,
			mentions,
			selectionStart,
			selectionEnd,
			insertion
		);
		displayText = result.text;
		mentions = result.mentions;
		selectionStart = result.caret;
		selectionEnd = result.caret;
		dismissedQueryKey = null;
		emitCanonicalValue();
		await tick();
		textarea?.focus();
		textarea?.setSelectionRange(result.caret, result.caret);
	}

	$effect(() => {
		if (value === lastCanonicalValue) {
			return;
		}

		const hydrated = hydrateCanonicalMentions(value, candidates);
		displayText = hydrated.text;
		mentions = hydrated.mentions;
		lastCanonicalValue = value;
		dismissedQueryKey = null;
		selectionStart = 0;
		selectionEnd = 0;
	});

	$effect(() => {
		const nextSignature = matchingCandidates.map((candidate) => candidate.pubkey).join(':');
		if (nextSignature !== candidateSignature) {
			candidateSignature = nextSignature;
			activeIndex = 0;
		} else if (activeIndex >= matchingCandidates.length) {
			activeIndex = Math.max(0, matchingCandidates.length - 1);
		}
	});

	function updateSelection(element: HTMLTextAreaElement) {
		selectionStart = element.selectionStart;
		selectionEnd = element.selectionEnd;
		if (queryKey !== dismissedQueryKey) {
			dismissedQueryKey = null;
		}
	}

	function emitCanonicalValue() {
		const canonical = serializeMentionText(displayText, mentions);
		lastCanonicalValue = canonical;
		onValueChange(canonical);
	}

	function handleInput(event: Event) {
		const element = event.currentTarget as HTMLTextAreaElement;
		const nextText = element.value;
		mentions = reconcileMentionRanges(displayText, nextText, mentions);
		displayText = nextText;
		updateSelection(element);
		emitCanonicalValue();
	}

	async function selectCandidate(candidate: MentionCandidate) {
		if (!activeQuery) {
			return;
		}

		const result = applyMentionSelection(displayText, mentions, activeQuery, candidate);
		displayText = result.text;
		mentions = result.mentions;
		selectionStart = result.caret;
		selectionEnd = result.caret;
		dismissedQueryKey = null;
		emitCanonicalValue();
		await tick();
		textarea?.focus();
		textarea?.setSelectionRange(result.caret, result.caret);
	}

	function handleKeydown(event: KeyboardEvent) {
		if (isComposing || event.isComposing) {
			if (event.key !== 'Enter') {
				onkeydown?.(event);
			}
			return;
		}

		if (isListOpen) {
			if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
				event.preventDefault();
				event.stopPropagation();
				const direction = event.key === 'ArrowDown' ? 1 : -1;
				activeIndex =
					(activeIndex + direction + matchingCandidates.length) % matchingCandidates.length;
				return;
			}
			if ((event.key === 'Enter' && !event.ctrlKey && !event.metaKey) || event.key === 'Tab') {
				event.preventDefault();
				event.stopPropagation();
				const candidate = matchingCandidates[activeIndex];
				if (candidate) {
					void selectCandidate(candidate);
				}
				return;
			}
			if (event.key === 'Escape') {
				event.preventDefault();
				event.stopPropagation();
				dismissedQueryKey = queryKey;
				return;
			}
		}

		onkeydown?.(event);
	}

	function handleCompositionEnd(event: CompositionEvent) {
		isComposing = false;
		updateSelection(event.currentTarget as HTMLTextAreaElement);
	}
</script>

<div class={rootClass}>
	<textarea
		{...textareaAttributes}
		{id}
		class={textareaClass}
		bind:this={textarea}
		value={displayText}
		role="combobox"
		aria-autocomplete="list"
		aria-controls={listboxId}
		aria-expanded={isListOpen}
		aria-activedescendant={activeOptionId}
		oninput={handleInput}
		onkeydown={handleKeydown}
		{onpaste}
		onfocus={(event) => {
			isFocused = true;
			updateSelection(event.currentTarget);
		}}
		onblur={() => (isFocused = false)}
		onselect={(event) => updateSelection(event.currentTarget)}
		onclick={(event) => updateSelection(event.currentTarget)}
		onkeyup={(event) => updateSelection(event.currentTarget)}
		oncompositionstart={() => (isComposing = true)}
		oncompositionend={handleCompositionEnd}
	></textarea>

	{#if isListOpen}
		<ul
			id={listboxId}
			class="mt-1 max-h-64 overflow-y-auto rounded-md border border-slate-200 bg-white py-1 shadow-sm dark:border-slate-700 dark:bg-slate-900"
			role="listbox"
			aria-label={m.mention_suggestions()}
		>
			{#each matchingCandidates as candidate, index (candidate.pubkey)}
				<li
					id={`${id}-mention-option-${candidate.pubkey}`}
					class={[
						'flex cursor-pointer items-center gap-2 px-3 py-2',
						index === activeIndex
							? 'bg-sky-50 text-sky-950 dark:bg-sky-950/60 dark:text-sky-50'
							: 'text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800'
					]}
					role="option"
					aria-selected={index === activeIndex}
					onpointerdown={(event) => {
						event.preventDefault();
						void selectCandidate(candidate);
					}}
				>
					<span class="min-w-0 flex-1 truncate font-semibold">@{candidate.displayName}</span>
					<span class="max-w-1/2 shrink-0 truncate text-xs text-slate-500 dark:text-slate-400">
						{candidate.nip05 ?? `${candidate.npub.slice(0, 16)}…`}
					</span>
				</li>
			{/each}
		</ul>
	{/if}
</div>
